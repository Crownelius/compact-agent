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
 * Render strategy
 * ───────────────
 * On entry we save the current cursor position with DECSC (`\x1b7`).
 * That position is the anchor: right after the prompt glyph, before
 * the filter chars. Every render:
 *
 *   1. Restore to anchor (DECRC `\x1b8`)
 *   2. Clear from cursor to end of screen (`\x1b[J`)
 *   3. Write the filter text (cursor advances along the prompt row)
 *   4. `\r\n` + rows of dropdown content below
 *   5. Restore to anchor again, then move right by filter.length so
 *      the cursor sits at the end of the filter (where the user
 *      expects to be typing)
 *
 * The single DECSC/DECRC pair is enough because the anchor never
 * moves during the lifetime of the widget. We compute the final
 * cursor position from filter.length rather than re-saving.
 *
 * Caveats:
 *   - Long filter that wraps to a new line breaks the column math.
 *     Filters are typically < 30 chars so this is acceptable.
 *   - If the dropdown would extend past the bottom of the terminal,
 *     the screen scrolls and the saved cursor position becomes
 *     stale. We cap visible rows to MAX_ROWS to keep this rare.
 *
 * Key handling
 * ────────────
 * While suggest is active, we detach all non-hotkey `keypress`
 * listeners so readline's line editor stops processing input (which
 * would otherwise echo chars into rl.line, navigate history on Up,
 * and emit 'line' on Enter — fighting our dropdown). We add a raw
 * `data` listener that parses bytes directly:
 *
 *   Ctrl+C / Esc          cancel
 *   Enter (CR or LF)      accept current selection
 *   Up / Down             move selection
 *   Backspace             delete last filter char; dismiss if empty
 *   Printable ASCII       append to filter, reset selection to 0
 *
 * Returns `{ accepted, command?, filter }`. The caller is
 * responsible for:
 *   - On accept: stashing the chosen command in
 *     __crowcoderQueuedInput and emitting 'line' to submit
 *   - On cancel: restoring rl.line to `filter` so the user can keep
 *     typing the partial command they had
 */
import { stdin, stdout } from 'node:process';
import type { Interface as RLInterface } from 'node:readline';

const ANSI = {
  cursorSave: '\x1b7',
  cursorRestore: '\x1b8',
  clearToEnd: '\x1b[J',
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

export interface InlineSuggestResult {
  /** True if the user picked an item (Enter); false on Esc / Ctrl+C / Backspace-to-empty. */
  accepted: boolean;
  /** The chosen command, only set when accepted=true. */
  command?: string;
  /** The filter string at exit. Caller restores rl.line to this on
   * cancel so the user can keep typing the partial command. */
  filter: string;
}

type TaggedListener = ((...args: unknown[]) => void) & { __crowcoderHotkey__?: boolean };

/**
 * Show the inline suggest dropdown and resolve when the user picks
 * or cancels.
 *
 * The caller must have already cleared rl.line and refreshed the
 * prompt — the cursor should be sitting at the typing position when
 * this is called (so DECSC captures the right anchor).
 */
export async function inlineSuggest(
  _rl: RLInterface,
  items: SuggestItem[],
  initialFilter: string = '/',
): Promise<InlineSuggestResult> {
  return new Promise<InlineSuggestResult>((resolve) => {
    let filter = initialFilter;
    let selected = 0;

    // Save the anchor — current cursor position is right after the
    // prompt glyph, before the filter text we're about to render.
    stdout.write(ANSI.cursorSave);

    // Defensive: ensure raw mode is on and the stream is flowing.
    // readline normally has these set already, but if the parent ever
    // pauses stdin or flips raw mode off, our data listener wouldn't
    // see typed bytes and the per-char update would silently break.
    const wasRaw = stdin.isRaw;
    try { stdin.setRawMode(true); } catch { /* noop */ }
    stdin.resume();

    // Detach readline's keypress listeners so the line editor doesn't
    // also process input. The hotkey listener (tagged
    // __crowcoderHotkey__) stays attached because it has its own
    // bail for `pickerActive`; the others (readline's own internal
    // emitter, history nav) get pulled.
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
      // Reserve: 2 (indent) + cmdCol + 2 (gutter) + descMax + safety
      const descMax = Math.max(20, termCols - cmdCol - 6);

      stdout.write(ANSI.cursorRestore);   // back to anchor
      stdout.write(ANSI.clearToEnd);      // wipe filter + dropdown from prev frame
      stdout.write(filter);               // redraw filter on prompt row

      if (shown.length === 0) {
        stdout.write(`\r\n  ${ANSI.dim}(no matches — Backspace to clear, Esc to dismiss)${ANSI.reset}`);
      } else {
        for (let i = 0; i < shown.length; i++) {
          const it = shown[i];
          const isSel = i === selected;

          let cmd = it.command;
          if (cmd.length > cmdCol) cmd = cmd.slice(0, cmdCol - 1) + '…';
          else cmd = cmd.padEnd(cmdCol, ' ');

          let desc = it.description;
          if (desc.length > descMax) desc = desc.slice(0, descMax - 1) + '…';

          // Selected row: reverse-video the whole row for clear
          // contrast (matches Claude Code's highlight). Unselected:
          // command in default color, description dim — keeps the
          // dropdown visually quiet.
          const line = isSel
            ? `${ANSI.reverse}  ${cmd}  ${desc}${ANSI.reset}`
            : `  ${cmd}  ${ANSI.dim}${desc}${ANSI.reset}`;
          stdout.write(`\r\n${line}`);
        }
        if (visible.length > shown.length) {
          stdout.write(`\r\n  ${ANSI.dim}… ${visible.length - shown.length} more · type to narrow${ANSI.reset}`);
        }
      }

      // Cursor back to anchor + advance to end of filter, so the
      // user sees the caret where they expect to be typing.
      stdout.write(ANSI.cursorRestore);
      if (filter.length > 0) {
        stdout.write(`\x1b[${filter.length}C`);
      }
    }

    function teardown(): void {
      stdin.removeListener('data', onData);
      for (const l of togglable) stdin.on('keypress', l);
      // Restore raw-mode state. (Leaving stdin paused or in cooked
      // mode would break readline's next prompt.)
      try { stdin.setRawMode(wasRaw); } catch { /* noop */ }
      // Wipe the dropdown + filter from the screen. The caller
      // restores rl.line + redraws the prompt as needed.
      stdout.write(ANSI.cursorRestore);
      stdout.write(ANSI.clearToEnd);
    }

    function onData(buf: Buffer): void {
      // Ctrl+C — cancel (treated same as Esc; the parent loop sees
      // Ctrl+C separately if pressed mid-stream).
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
      // Tab — accept selection but DON'T submit. Useful when the
      // command takes args (e.g. /model <name>) and the user wants
      // to fill the command then add the arg.
      if (buf.length === 1 && buf[0] === 0x09) {
        const visible = visibleItems();
        if (visible.length === 0) return;
        const chosen = visible[selected];
        teardown();
        // We signal "accepted, but don't submit" by returning the
        // command with a trailing space — the caller checks for that.
        resolve({ accepted: true, command: chosen.command + ' ', filter });
        return;
      }
      // Printable input — extend filter and re-render. This is the
      // per-char update path: every byte the user types lands here
      // and immediately triggers render(), which recomputes visible
      // items from the current filter and repaints the dropdown.
      // Fast typing can deliver a multi-byte chunk in a single data
      // event; we treat that as one render rather than one per byte
      // (no visible difference, fewer paints).
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
