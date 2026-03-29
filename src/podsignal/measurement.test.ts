import { describe, it, expect } from 'vitest';
import { containsForbiddenCausalClaim } from './measurement.js';

describe('measurement honesty', () => {
  it('flags causal overclaims', () => {
    expect(containsForbiddenCausalClaim('This clip caused a 40% lift')).toBe(true);
    expect(containsForbiddenCausalClaim('We proved the title won')).toBe(true);
  });

  it('allows directional language', () => {
    expect(containsForbiddenCausalClaim('Likely associated with higher plays')).toBe(false);
    expect(containsForbiddenCausalClaim('Observed 120 clicks on tracked links')).toBe(false);
  });
});
