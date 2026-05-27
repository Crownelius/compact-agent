import { describe, expect, it } from 'vitest';
import { normalizeTypeaheadDraftForPrompt } from '../src/prompt-buffer.js';

describe('type-ahead prompt restoration', () => {
  it('restores queued single-line text as an editable draft', () => {
    expect(normalizeTypeaheadDraftForPrompt('keep typing')).toBe('keep typing');
  });

  it('does not turn enter typed during a chain into auto-submit behavior', () => {
    expect(normalizeTypeaheadDraftForPrompt('first line\r\nsecond line\n')).toBe('first line second line');
  });
});
