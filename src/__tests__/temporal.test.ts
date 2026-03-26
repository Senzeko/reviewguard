import { describe, it, expect } from 'vitest';
import { computeTemporalScore } from '../engine/factors/temporal.js';

const hoursAgo = (n: number) => new Date(Date.now() - n * 60 * 60 * 1000);

describe('computeTemporalScore', () => {
  it('12 hours -> HIGH', () => {
    const r = computeTemporalScore(new Date(), hoursAgo(12));
    expect(r.level).toBe('HIGH');
    expect(r.score).toBe(1.0);
  });

  it('73 hours -> MEDIUM', () => {
    const r = computeTemporalScore(new Date(), hoursAgo(73));
    expect(r.level).toBe('MEDIUM');
    expect(r.score).toBe(0.6);
  });

  it('200 hours -> LOW', () => {
    const r = computeTemporalScore(new Date(), hoursAgo(200));
    expect(r.level).toBe('LOW');
    expect(r.score).toBe(0.3);
  });

  it('400 hours -> NONE', () => {
    const r = computeTemporalScore(new Date(), hoursAgo(400));
    expect(r.level).toBe('NONE');
    expect(r.score).toBe(0.0);
  });

  it('delta_hours is always positive regardless of order', () => {
    const r = computeTemporalScore(hoursAgo(73), new Date());
    expect(r.delta_hours).toBeGreaterThan(72);
    expect(r.delta_hours).toBeLessThan(74);
  });

  it('exact boundary at 24h is HIGH', () => {
    const r = computeTemporalScore(new Date(), hoursAgo(24));
    expect(r.level).toBe('HIGH');
  });

  it('exact boundary at 168h is MEDIUM', () => {
    const r = computeTemporalScore(new Date(), hoursAgo(168));
    expect(r.level).toBe('MEDIUM');
  });

  it('exact boundary at 336h is LOW', () => {
    const r = computeTemporalScore(new Date(), hoursAgo(336));
    expect(r.level).toBe('LOW');
  });
});
