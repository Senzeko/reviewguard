import { describe, it, expect } from 'vitest';
import { mergeLaunchPack } from './launchPack.js';
import { OUTPUT_USAGE_EVENT_TYPES } from './measurement.js';

describe('launchPack merge', () => {
  it('merges partial updates', () => {
    const next = mergeLaunchPack({ status: 'draft', foo: 1 }, { status: 'approved', selectedTitleIndex: 2 });
    expect(next['status']).toBe('approved');
    expect(next['foo']).toBe(1);
    expect(next['selectedTitleIndex']).toBe(2);
  });
});

describe('measurement taxonomy', () => {
  it('includes launch_asset_copied for output usage', () => {
    expect(OUTPUT_USAGE_EVENT_TYPES).toContain('launch_asset_copied');
  });
});
