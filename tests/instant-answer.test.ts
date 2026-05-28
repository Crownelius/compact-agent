import { describe, expect, it } from 'vitest';
import { maybeInstantAnswer } from '../src/instant-answer.js';

describe('instant local answers', () => {
  it('answers trivial conversational prompts without touching the provider', () => {
    expect(maybeInstantAnswer('hi there')).toBe('Hi. What would you like Cawdex to work on?');
    expect(maybeInstantAnswer('THANK YOU!')).toBe("You're welcome.");
    expect(maybeInstantAnswer("what's Cawdex?")).toBe('I am Cawdex: terminal coding agents with a mind for the whole repo.');
  });

  it('does not catch substantive prompts that need the model or tools', () => {
    expect(maybeInstantAnswer('hi there, fix the tests')).toBeNull();
    expect(maybeInstantAnswer('thanks, now write a poem')).toBeNull();
  });

  it('answers basic square-root prompts without a provider call', () => {
    expect(maybeInstantAnswer('what is the square root of 81')).toBe('The square root of 81 is 9.');
    expect(maybeInstantAnswer('sqrt of 2')).toBe('The square root of 2 is 1.4142135624.');
  });

  it('answers small arithmetic prompts safely', () => {
    expect(maybeInstantAnswer('what is 12 times 3?')).toBe('12 times 3 = 36.');
    expect(maybeInstantAnswer('10 / 0')).toBe('Division by zero is undefined.');
  });
});
