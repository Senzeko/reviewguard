import { describe, it, expect } from 'vitest';
import { utcMonthKey } from './processingQuota.js';

describe('utcMonthKey', () => {
  it('formats UTC year-month with zero padding', () => {
    expect(utcMonthKey(new Date(Date.UTC(2026, 0, 15)))).toBe('2026-01');
    expect(utcMonthKey(new Date(Date.UTC(2026, 8, 1)))).toBe('2026-09');
  });
});
