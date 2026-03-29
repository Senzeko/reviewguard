import { describe, it, expect } from 'vitest';
import { sseReconnectDelayMs } from './sseBackoff';

describe('sseReconnectDelayMs', () => {
  it('increases exponentially and caps', () => {
    expect(sseReconnectDelayMs(1)).toBe(1200);
    expect(sseReconnectDelayMs(2)).toBe(2400);
    expect(sseReconnectDelayMs(10)).toBe(30_000);
  });
});
