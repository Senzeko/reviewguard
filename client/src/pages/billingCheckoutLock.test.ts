import { describe, it, expect } from 'vitest';

/** Mirrors Billing handleCheckout guard: do not start a second session while redirect is in progress. */
describe('billing checkout single-fire', () => {
  it('blocks a second start while the first holds the lock', () => {
    let checkoutLock = false;
    const tryCheckout = () => {
      if (checkoutLock) return 'blocked';
      checkoutLock = true;
      return 'started';
    };
    expect(tryCheckout()).toBe('started');
    expect(tryCheckout()).toBe('blocked');
  });
});
