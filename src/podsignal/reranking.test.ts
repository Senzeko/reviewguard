import { describe, it, expect } from 'vitest';
import { rankTitleVariants } from './reranking.js';

describe('reranking', () => {
  it('preserves order when no historical scores', () => {
    const v = [
      { id: 'a', key: 'a' },
      { id: 'b', key: 'b' },
    ];
    expect(rankTitleVariants(v).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('sorts by historicalScore when present', () => {
    const v = [
      { id: 'low', key: 'low', historicalScore: 1 },
      { id: 'high', key: 'high', historicalScore: 9 },
    ];
    expect(rankTitleVariants(v).map((x) => x.id)).toEqual(['high', 'low']);
  });
});
