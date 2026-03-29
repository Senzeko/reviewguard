import { describe, it, expect } from 'vitest';
import { HTTP_TIMEOUT_USER_MESSAGE, isLikelyTimeoutError } from './httpPolicy';

describe('httpPolicy timeout UX', () => {
  it('flags ECONNABORTED as timeout-like', () => {
    expect(isLikelyTimeoutError({ code: 'ECONNABORTED', message: 'aborted' })).toBe(true);
  });

  it('flags timeout in message', () => {
    expect(isLikelyTimeoutError({ code: undefined, message: 'timeout of 5000ms exceeded' })).toBe(
      true,
    );
  });

  it('does not flag unrelated 4xx errors', () => {
    expect(isLikelyTimeoutError({ code: 'ERR_BAD_REQUEST', message: 'Request failed with 400' })).toBe(
      false,
    );
  });

  it('exports stable user-facing timeout message', () => {
    expect(HTTP_TIMEOUT_USER_MESSAGE.length).toBeGreaterThan(10);
    expect(HTTP_TIMEOUT_USER_MESSAGE.toLowerCase()).toMatch(/timed|timeout/);
  });
});
