/**
 * Live queue display — a bottom-anchored input box that stays visible
 * during streaming and tool execution, so the user can see what they're
 * typing into the queue (and erase it with backspace).
 *
 * The technique: ANSI DECSTBM (Set Top and Bottom Margins) reserves a
 * scrolling region above the last row. Streaming output scrolls in the
 * upper region; the bottom row is fixed and we redraw it on every
 * keystroke.
 *
 * Layout:
 *
 *   ┌── upper scroll region (rows 1..N-1) ──┐
 *   │                                        │
 *   │  streamed model output writes here     │
 *   │  scrolling naturally as text arrives   │
 *   │                                        │
 *   ├── fixed bottom row (row N) ────────────┤
 *   │  ▶ queued: <user's typed text>         │  ← updated on each keystroke
 *   └────────────────────────────────────────┘
 *
 * Caveats:
 *   - DECSTBM is widely supported (xterm, iTerm, Windows Terminal,
 *     Alacritty, Kitty) but legacy ConHost has quirks. If activation
 *     fails or the terminal isn't a TTY, we no-op.
 *   - Terminal resize mid-stream isn't handled — the box stays at the
 *     row we reserved. Acceptable trade-off; resize is rare mid-chain.
 *   - Screen-reader mode skips this entirely — NVDA / JAWS read every
 *     cursor move as fresh text, which makes a live-updating widget
 *     much worse than a quiet one-line hint.
 */

const ANSI = {
  saveCursor: '\x1B7',                              // DECSC (more reliable than ESC[s)
  restoreCursor: '\x1B8',                           // DECRC
  scrollRegion: (top: number, bot: number) => `\x1B[${top};${bot}r`,
  resetScrollRegion: '\x1B[r',
  moveTo: (row: number, col: number) => `\x1B[${row};${col}H`,
  clearLine: '\x1B[2K',
  bold: '\x1B[1m',
  reset: '\x1B[0m',
  dim: '\x1B[2m',
};

interface ActiveState {
  rows: number;
  cols: number;
  // Reserved row at the very bottom for the input box
  boxRow: number;
}

let active: ActiveState | null = null;

/**
 * Begin reserving the bottom row + setting the scroll region.
 * Safe to call repeatedly; subsequent calls are no-ops.
 * Returns true if activation succeeded.
 */
export function activate(): boolean {
  if (active) return true;
  const stdout = process.stdout;
  if (!stdout.isTTY) return false;

  const rows = stdout.rows;
  const cols = stdout.columns;
  // Bail if terminal didn't report dimensions (rare but possible)
  if (!rows || !cols || rows < 4) return false;

  // Print one blank line at the cursor position to ensure we don't
  // collide with prior content, then move cursor up. This guarantees
  // the reserved bottom row is logically below the current output.
  stdout.write('\n');

  // Set scroll region to rows 1..(rows-1), leaving the last row for us
  stdout.write(ANSI.scrollRegion(1, rows - 1));

  // Move cursor back into the scroll region (top of the last visible
  // scroll line). This puts subsequent output one row above the box.
  stdout.write(ANSI.moveTo(rows - 1, 1));

  active = { rows, cols, boxRow: rows };

  // Initial draw of empty box
  drawBox('');
  return true;
}

/**
 * Update the input-box content. Call on every typed char (or
 * backspace) so the user sees their queue in real time.
 *
 * Truncates text to fit terminal width; if longer, shows the LAST
 * (cols-12) chars so the most-recent typing is always visible.
 */
export function update(text: string): void {
  if (!active) return;
  drawBox(text);
}

function drawBox(text: string): void {
  if (!active) return;
  const stdout = process.stdout;
  const { boxRow, cols } = active;

  // Save where the streaming cursor was
  stdout.write(ANSI.saveCursor);

  // Move to the reserved row, clear it, draw the indicator + queue
  stdout.write(ANSI.moveTo(boxRow, 1));
  stdout.write(ANSI.clearLine);

  const prefix = '  ▶ queued: ';
  const budget = Math.max(20, cols - prefix.length - 2);
  let display = text;
  // Show the END of the text (most recently typed) when overflowing
  if (display.length > budget) {
    display = '…' + display.slice(display.length - budget + 1);
  }
  // Replace any CR/LF in the display so they don't break the box layout
  display = display.replace(/[\r\n]+/g, ' ⏎ ');

  // Soft-styled prefix + content. Bold for the marker, dim for "queued:",
  // normal for the text itself.
  stdout.write(ANSI.bold + '  ▶' + ANSI.reset + ANSI.dim + ' queued: ' + ANSI.reset + display);

  // Restore cursor to where streaming was writing
  stdout.write(ANSI.restoreCursor);
}

/**
 * Tear down the box and restore the default scroll region.
 * Safe to call repeatedly; no-op when not active.
 *
 * Idempotency matters because we want this in `finally` blocks alongside
 * other cleanup that might also call it.
 */
export function deactivate(): void {
  if (!active) return;
  const stdout = process.stdout;
  const { boxRow } = active;

  // Reset scroll region
  stdout.write(ANSI.resetScrollRegion);

  // Clear the reserved row
  stdout.write(ANSI.moveTo(boxRow, 1));
  stdout.write(ANSI.clearLine);

  // Park the cursor on the row above the (now-cleared) box
  stdout.write(ANSI.moveTo(boxRow - 1, 1));
  stdout.write('\n');   // move down one for next prompt

  active = null;
}

/** Test helper / fallback: are we currently active? */
export function isActive(): boolean {
  return active !== null;
}
