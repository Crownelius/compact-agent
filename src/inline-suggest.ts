/**
 * Inline command-suggest dropdown — renders directly below the prompt
 * cursor without taking over the screen.
 *
 * Mental model: Claude Code's `/` autocomplete. The dropdown sits
 * inline beneath the live prompt, showing matching slash commands in
 * two columns (command + one-line description), narrowing as the user
 * types. Unlike picker.ts (which uses the alt-screen buffer for a
 * full-screen list), this widget stays in the normal screen buffer
 * and only paints a few rows of dropdown below the cursor — the
 * surrounding chat output stays visible.
 *
 * Render strategy — RELATIVE cursor positioning only
 * ──────────────────────────────────────────────────
 * The first cut of this module used DECSC/DECRC (`\x1b7`/`\x1b8`) to
 * pin an anchor at the start of the filter, then restored to it on
 * every render. That fails on Windows PowerShell legacy ConHost as
 * soon as the dropdown content scrolls the terminal — the saved
 * position is stored in *visible* coordinates, so after a scroll it
 * lands on the wrong row and renders pile up below the previous one.
 *
 * The fix: track our own row count and use relative cursor moves
 * (`\x1b[<N>A` go up, `\r` col 0, `\x1b[<N>C` advance N cols). Every
 * render writes the FULL prompt line — prompt prefix + filter — so
 * we don't need to "skip over" the prefix to reach the filter cell.
 * The caller hands us the prompt prefix (ANSI-styled string + the
 * visible char count) so we can repaint it each frame.
 *
 * Per-frame sequence:
 *   1. Up `_dropdownRows` lines     → back to the filter row
 *   2. `\r`                          → col 0 of that row
 *   3. `\x1b[J`                      → clear from cursor to end of screen
 *   4. promptPrefix + filter         → repaint the prompt line
 *   5. `\r\n` + each dropdown row    → fill the rows below
 *   6. Up `rowsDrawn` + `\r` + right (promptVisLen + filter.length)
 *                                   → cursor settles at end of filter
 *
 * Steps 1–3 only refer to rows we previously printed (which are still
 * on screen, because they came AFTER the prompt). Even if the screen
 * scrolled between renders, relative up-moves still target our own
 * rows correctly because they're contiguous with the cursor.
 *
 * Key handling
 * ────────────
 * While suggest is active, we detach all non-hotkey `keypress`
 * listeners so readline's line editor stops processing input. A raw
 * `data` listener parses bytes directly:
 *
 *   Ctrl+C / Esc          cancel
 *   Enter (CR or LF)      accept current selection
 *   Up / Down             move selection
 *   Backspace             delete last filter char; dismiss if empty
 *   Tab                   accept without submitting (sentinel:
 *                         trailing space on command)
 *   Printable ASCII       append to filter, reset selection to 0
 */
import { stdin, stdout } from 'node:process';
import type { Interface as RLInterface } from 'node:readline';

const ANSI = {
  clearToEnd: '\x1b[J',
  clearLine: '\x1b[K',
  reverse: '\x1b[7m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

/** Cap visible dropdown rows. Trades discoverability for keeping the
 * surrounding chat output visible. Matches Claude Code's behavior. */
const MAX_ROWS = 8;

export interface SuggestItem {
  /** The slash command, e.g. "/help". */
  command: string;
  /** One-line description shown in the second column. */
  description: string;
}

export interface InlineSuggestOptions {
  /**
   * The styled prompt prefix to repaint at the start of every render
   * (includes any chalk codes). Defaults to "  ❯ " (no decorative).
   */
  promptPrefix?: string;
  /**
   * Visible character width of `promptPrefix` (i.e. its length minus
   * any ANSI escape sequences). Used to position the cursor at the
   * end of the filter after a render. Defaults to counting the
   * stripped prefix when omitted.
   */
  promptVisibleLen?: number;
}

export interface InlineSuggestResult {
  /** True if the user picked an item (Enter); false on Esc / Ctrl+C / Backspace-to-empty. */
  accepted: boolean;
  /** The chosen command, only set when accepted=true. Trailing space
   * means "fill but don't submit" (Tab pathway). */
  command?: string;
  /** The filter string at exit. Caller restores rl.line to this on
   * cancel so the user can keep typing the partial command. */
  filter: string;
}

type TaggedListener = ((...args: unknown[]) => void) & { __crowcoderHotkey__?: boolean };

/** Strip ANSI SGR escape sequences for visible-width math. */
function ansiVisibleLen(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

/**
 * Show the inline suggest dropdown and resolve when the user picks
 * or cancels.
 *
 * The caller should have cleared rl.line and refreshed the prompt
 * before calling — we repaint the prompt line ourselves but the
 * cursor needs to be on a stable row (not mid-scroll).
 */
export async function inlineSuggest(
  _rl: RLInterface,
  items: SuggestItem[],
  initialFilter: string = '/',
  opts: InlineSuggestOptions = {},
): Promise<InlineSuggestResult> {
  return new Promise<InlineSuggestResult>((resolve) => {
    let filter = initialFilter;
    let selected = 0;
    // Rows of dropdown printed on the previous frame (NOT including
    // the filter row). The next frame goes up by this many to land
    // back on the filter row.
    let dropdownRows = 0;

    const promptPrefix = opts.promptPrefix ?? '  ❯ ';
    const promptVisLen = opts.promptVisibleLen ?? ansiVisibleLen(promptPrefix);

    // Defensive: ensure raw mode is on and the stream is flowing.
    const wasRaw = stdin.isRaw;
    try { stdin.setRawMode(true); } catch { /* noop */ }
    stdin.resume();

    // Detach readline's keypress listeners so the line editor doesn't
    // also process input. The hotkey listener (tagged
    // __crowcoderHotkey__) stays attached because it has its own
    // bail for `pickerActive`; the others get pulled.
    const allKeypress = stdin.listeners('keypress').slice() as TaggedListener[];
    const togglable = allKeypress.filter((l) => !l.__crowcoderHotkey__);
    for (const l of togglable) stdin.removeListener('keypress', l);

    function visibleItems(): SuggestItem[] {
      // Strip leading '/' for matching — the filter starts with '/'
      // (since that's the trigger) but the commands also start with
      // '/', so the slash is implicit and we want to match on the
      // letters that come after.
      const f = filter.replace(/^\//, '').toLowerCase();
      if (!f) return items.slice();
      return items.filter((it) =>
        it.command.toLowerCase().includes(f) ||
        it.description.toLowerCase().includes(f),
      );
    }

    function render(): void {
      const visible = visibleItems();
      if (selected >= visible.length) selected = Math.max(0, visible.length - 1);
      if (selected < 0) selected = 0;

      const shown = visible.slice(0, MAX_ROWS);

      // Column widths — command col sized to longest visible command,
      // clamped to a reasonable range so the description col gets
      // enough space on narrow terminals.
      const cmdCol = Math.min(
        20,
        Math.max(10, shown.reduce((m, it) => Math.max(m, it.command.length), 0)),
      );
      const termCols = stdout.columns || 80;
      const descMax = Math.max(20, termCols - cmdCol - 6);

      // ── Reposition to the filter row ──
      // Up by however many dropdown rows we left on screen last
      // frame. Then \r to col 0. Then clear from cursor to end of
      // screen — that erases the rest of the filter row AND every
      // dropdown row below.
      if (dropdownRows > 0) {
        stdout.write(`\x1b[${dropdownRows}A`);
      }
      stdout.write('\r');
      stdout.write(ANSI.clearToEnd);

      // Repaint the prompt line: styled prefix + filter chars. We
      // own this line now (the clear above wiped whatever was here).
      stdout.write(promptPrefix + filter);

      // Draw dropdown rows beneath. Each row gets a "\r\n" prefix
      // so it lands on a fresh line at col 0 regardless of where the
      // previous write left the cursor. (Bare "\n" in raw mode only
      // moves down, not back to col 0.)
      let rowsDrawn = 0;
      if (shown.length === 0) {
        stdout.write(`\r\n  ${ANSI.dim}(no matches — Backspace to clear, Esc to dismiss)${ANSI.reset}`);
        rowsDrawn = 1;
      } else {
        for (let i = 0; i < shown.length; i++) {
          const it = shown[i];
          const isSel = i === selected;

          let cmd = it.command;
          if (cmd.length > cmdCol) cmd = cmd.slice(0, cmdCol - 1) + '…';
          else cmd = cmd.padEnd(cmdCol, ' ');

          let desc = it.description;
          if (desc.length > descMax) desc = desc.slice(0, descMax - 1) + '…';

          const line = isSel
            ? `${ANSI.reverse}  ${cmd}  ${desc}${ANSI.reset}`
            : `  ${cmd}  ${ANSI.dim}${desc}${ANSI.reset}`;
          stdout.write(`\r\n${line}`);
          rowsDrawn++;
        }
        if (visible.length > shown.length) {
          stdout.write(`\r\n  ${ANSI.dim}… ${visible.length - shown.length} more · type to narrow${ANSI.reset}`);
          rowsDrawn++;
        }
      }

      // Cursor back to the end of the filter on the prompt row.
      // After the last write we're at end-of-last-dropdown-row;
      // go up `rowsDrawn` lines, \r to col 0, then advance to the
      // visible column of end-of-filter.
      stdout.write(`\x1b[${rowsDrawn}A\r`);
      const endCol = promptVisLen + filter.length;
      if (endCol > 0) {
        stdout.write(`\x1b[${endCol}C`);
      }
      dropdownRows = rowsDrawn;
    }

    function teardown(): void {
      stdin.removeListener('data', onData);
      for (const l of togglable) stdin.on('keypress', l);
      try { stdin.setRawMode(wasRaw); } catch { /* noop */ }
      // Wipe the dropdown area. We're at end-of-filter; go down +
      // \r + clear-to-end clears everything we drew below the
      // prompt row. Leave the filter on screen — the caller decides
      // whether to overwrite (on accept) or restore rl.line + redraw
      // (on cancel).
      if (dropdownRows > 0) {
        stdout.write('\r\n');
        stdout.write(ANSI.clearToEnd);
        // Cursor is now at col 0 of the row after the filter.
        // Move back up + to end of filter so caller sees a clean
        // single-row state.
        stdout.write(`\x1b[1A\r`);
        const endCol = promptVisLen + filter.length;
        if (endCol > 0) {
          stdout.write(`\x1b[${endCol}C`);
        }
      }
      dropdownRows = 0;
    }

    function onData(buf: Buffer): void {
      // Ctrl+C — cancel.
      if (buf.length === 1 && buf[0] === 0x03) {
        teardown();
        resolve({ accepted: false, filter });
        return;
      }
      // Esc (bare) — cancel. Multi-byte chunks starting with 0x1B
      // are arrow keys / function keys (handled below).
      if (buf.length === 1 && buf[0] === 0x1B) {
        teardown();
        resolve({ accepted: false, filter });
        return;
      }
      // Enter — accept current selection (if any).
      if (buf.length === 1 && (buf[0] === 0x0D || buf[0] === 0x0A)) {
        const visible = visibleItems();
        if (visible.length === 0) return;
        const chosen = visible[selected];
        teardown();
        resolve({ accepted: true, command: chosen.command, filter });
        return;
      }
      // Backspace (DEL 0x7F on POSIX, BS 0x08 on Windows).
      if (buf.length === 1 && (buf[0] === 0x7F || buf[0] === 0x08)) {
        if (filter.length <= 1) {
          // Deleting the only char (typically the leading '/') —
          // dismiss the dropdown and let the user have a blank line.
          filter = '';
          teardown();
          resolve({ accepted: false, filter });
          return;
        }
        filter = filter.slice(0, -1);
        selected = 0;
        render();
        return;
      }
      // Arrow keys: `Esc [ <code>` (3 bytes).
      if (buf.length >= 3 && buf[0] === 0x1B && buf[1] === 0x5B) {
        const code = buf[2];
        if (code === 0x41) {                // Up
          const visible = visibleItems();
          if (visible.length > 0) {
            selected = (selected - 1 + visible.length) % visible.length;
          }
          render();
          return;
        }
        if (code === 0x42) {                // Down
          const visible = visibleItems();
          if (visible.length > 0) {
            selected = (selected + 1) % visible.length;
          }
          render();
          return;
        }
        // Left/Right/Home/End/PgUp/PgDn — ignore in inline mode.
        return;
      }
      // Tab — accept selection but DON'T submit. Returns command with
      // a trailing space so the caller can detect "fill but don't run".
      if (buf.length === 1 && buf[0] === 0x09) {
        const visible = visibleItems();
        if (visible.length === 0) return;
        const chosen = visible[selected];
        teardown();
        resolve({ accepted: true, command: chosen.command + ' ', filter });
        return;
      }
      // Printable input — extend filter and re-render. This is the
      // per-char update path: every byte the user types lands here
      // and immediately triggers render(), which recomputes visible
      // items from the current filter and repaints the dropdown.
      const s = buf.toString('utf-8');
      if (/^[\x20-\x7E]+$/.test(s)) {
        filter += s;
        selected = 0;
        render();
      }
    }

    stdin.on('data', onData);
    render();
  });
}
