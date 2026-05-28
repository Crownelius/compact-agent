import { describe, expect, it } from 'vitest';
import {
  BRAND_LOCKUP,
  BRAND_NAME,
  BRAND_SPACED_NAME,
  BRAND_TAGLINE,
  LEGACY_CLI_NAME,
  PRIMARY_CLI_NAME,
} from '../src/brand.js';

describe('Cawdex brand constants', () => {
  it('keeps the public name and tagline in one canonical lockup', () => {
    expect(BRAND_NAME).toBe('Cawdex');
    expect(BRAND_TAGLINE).toBe('terminal coding agents with a mind for the whole repo');
    expect(BRAND_LOCKUP).toBe('Cawdex — terminal coding agents with a mind for the whole repo');
    expect(BRAND_SPACED_NAME).toBe('C A W D E X');
  });

  it('keeps cawdex primary while documenting the legacy CLI alias', () => {
    expect(PRIMARY_CLI_NAME).toBe('cawdex');
    expect(LEGACY_CLI_NAME).toBe('ventipus');
  });
});
