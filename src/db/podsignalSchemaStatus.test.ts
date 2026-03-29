import { describe, it, expect } from 'vitest';
import { isMissingSchemaError } from './podsignalSchemaStatus.js';

describe('isMissingSchemaError', () => {
  it('detects Postgres undefined table / column', () => {
    expect(isMissingSchemaError({ code: '42P01' })).toBe(true);
    expect(isMissingSchemaError({ code: '42703' })).toBe(true);
    expect(isMissingSchemaError({ code: '23505' })).toBe(false);
    expect(isMissingSchemaError(new Error('oops'))).toBe(false);
  });
});
