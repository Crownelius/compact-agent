import { describe, it, expect } from 'vitest';
import { COMMAND_CATALOG, completeSlashCommandNames } from '../src/command-palette.js';
import {
  buildInlineSuggestDropdownEraseSequence,
  buildInlineSuggestEraseSequence,
  filterSuggestItems,
  formatInlineSuggestFilterForPrompt,
  maxVisibleSuggestRows,
  parseInlineSuggestInput,
  visibleSuggestWindow,
  type SuggestItem,
} from '../src/inline-suggest.js';

describe('inline command selector helpers', () => {
  it('includes the palette listing command in the slash catalog', () => {
    expect(COMMAND_CATALOG.some((c) => c.command === '/palettes')).toBe(true);
  });

  it('matches commands, categories, and descriptions while typing', () => {
    const items: SuggestItem[] = COMMAND_CATALOG.map((c) => ({
      command: c.command,
      hint: c.category,
      description: c.description,
    }));

    expect(filterSuggestItems(items, '/pal').map((i) => i.command)).toEqual(
      expect.arrayContaining(['/palette', '/palettes']),
    );
    expect(filterSuggestItems(items, '/git').some((i) => i.hint === 'Git')).toBe(true);
  });

  it('keeps the selected row visible when scrolling beyond the first page', () => {
    const items = Array.from({ length: 24 }, (_, i) => ({ command: `/cmd-${i}`, description: 'demo' }));
    const win = visibleSuggestWindow(items, 17, 8);

    expect(win.startIdx).toBeGreaterThan(0);
    expect(win.items).toContain(items[17]);
    expect(win.items).toHaveLength(8);
  });

  it('shrinks the selector window in short terminals', () => {
    expect(maxVisibleSuggestRows(24)).toBe(6);
    expect(maxVisibleSuggestRows(10)).toBe(2);
    expect(maxVisibleSuggestRows(6)).toBe(1);
  });

  it('keeps the visible command window bounded instead of taking the viewport', () => {
    for (const rows of [4, 6, 10, 24, 80]) {
      const visibleRows = maxVisibleSuggestRows(rows);
      const promptAndFooterRows = 2;

      expect(visibleRows + promptAndFooterRows).toBeLessThanOrEqual(Math.ceil(rows / 2) + 1);
      expect(visibleRows).toBeLessThanOrEqual(6);
    }
  });

  it('keeps typing and scroll keys inside the selector controller', () => {
    expect(parseInlineSuggestInput(Buffer.from('pal'))).toEqual({ type: 'append', text: 'pal' });
    expect(parseInlineSuggestInput(Buffer.from([0x1B, 0x5B, 0x42]))).toEqual({ type: 'move', delta: 1 });
    expect(parseInlineSuggestInput(Buffer.from([0x1B, 0x5B, 0x41]))).toEqual({ type: 'move', delta: -1 });
    expect(parseInlineSuggestInput(Buffer.from([0x1B, 0x5B, 0x36, 0x7E]))).toEqual({ type: 'move', delta: 5 });
    expect(parseInlineSuggestInput(Buffer.from([0x1B, 0x5B, 0x35, 0x7E]))).toEqual({ type: 'move', delta: -5 });
    expect(parseInlineSuggestInput(Buffer.from([0x1B, 0x5B, 0x48]))).toEqual({ type: 'jump', target: 'start' });
    expect(parseInlineSuggestInput(Buffer.from([0x1B, 0x5B, 0x46]))).toEqual({ type: 'jump', target: 'end' });
    expect(parseInlineSuggestInput(Buffer.from([0x1B, 0x5B, 0x44]))).toEqual({ type: 'ignore' });
  });

  it('keeps long typed filters on one prompt row', () => {
    const filter = '/palette ' + 'x'.repeat(80);
    const clipped = formatInlineSuggestFilterForPrompt(filter, 8, 32);

    expect(clipped.visibleLen + 8).toBeLessThan(32);
    expect(clipped.text).toHaveLength(clipped.visibleLen);
    expect(clipped.text.startsWith('…')).toBe(true);
  });

  it('erases only selector-owned rows instead of clearing the screen', () => {
    const frame = buildInlineSuggestEraseSequence(3);
    const dropdown = buildInlineSuggestDropdownEraseSequence(3);

    expect(frame).not.toContain('\x1b[J');
    expect(dropdown).not.toContain('\x1b[J');
    expect(frame).not.toContain('\x1b[?1049h');
    expect(dropdown).not.toContain('\x1b[?1049h');
    expect(frame).toContain('\x1b[2K');
    expect(dropdown).toContain('\x1b[2K');
  });

  it('keeps readline completion from dumping the slash catalog', () => {
    const commands = ['/help', '/history', '/hooks'];

    expect(completeSlashCommandNames('/', commands)).toEqual([[], '/']);
    expect(completeSlashCommandNames('/h', commands)).toEqual([[], '/h']);
    expect(completeSlashCommandNames('/hi', commands)).toEqual([['/history'], '/hi']);
    expect(completeSlashCommandNames('hello', commands)).toEqual([[], 'hello']);
  });
});
