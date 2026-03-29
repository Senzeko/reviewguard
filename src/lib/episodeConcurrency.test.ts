import { describe, it, expect } from 'vitest';
import { isStaleVersusIfUnmodifiedSince } from './episodeConcurrency.js';

describe('isStaleVersusIfUnmodifiedSince', () => {
  const base = new Date('2025-01-15T12:00:00.000Z');

  it('returns false when client baseline is omitted', () => {
    expect(isStaleVersusIfUnmodifiedSince(undefined, base)).toBe(false);
  });

  it('returns false when server time matches client baseline within tolerance', () => {
    const same = new Date(base.getTime());
    expect(isStaleVersusIfUnmodifiedSince(same.toISOString(), base)).toBe(false);
  });

  it('returns true when server is newer than baseline beyond tolerance', () => {
    const newer = new Date(base.getTime() + 5000);
    expect(isStaleVersusIfUnmodifiedSince(base.toISOString(), newer)).toBe(true);
  });

  it('returns true for invalid client ISO', () => {
    expect(isStaleVersusIfUnmodifiedSince('not-a-date', base)).toBe(true);
  });
});
