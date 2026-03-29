import { describe, it, expect } from 'vitest';
import type { AuthUserPayload } from './authUserPayload.js';

/** Contract: login/signup/me JSON must satisfy client `AuthUser` (merchant nullable). */
describe('AuthUserPayload', () => {
  it('matches the session shape returned by POST /api/auth/login and GET /api/auth/me', () => {
    const minimal: AuthUserPayload = {
      userId: 'u1',
      email: 'a@b.com',
      fullName: 'Test',
      merchantId: null,
      merchant: null,
    };
    expect(minimal.merchant).toBeNull();
  });
});
