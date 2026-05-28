import { describe, expect, it } from 'vitest';
import { maybeInstantAnswer } from '../src/instant-answer.js';

describe('instant local answers', () => {
  it('answers basic square-root prompts without a provider call', () => {
    expect(maybeInstantAnswer('what is the square root of 81')).toBe('The square root of 81 is 9.');
    expect(maybeInstantAnswer('sqrt of 2')).toBe('The square root of 2 is 1.4142135624.');
  });

  it('answers small arithmetic prompts safely', () => {
    expect(maybeInstantAnswer('what is 12 times 3?')).toBe('12 times 3 = 36.');
    expect(maybeInstantAnswer('10 / 0')).toBe('Division by zero is undefined.');
  });
});
