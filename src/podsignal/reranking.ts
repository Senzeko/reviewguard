/**
 * Deterministic reranking — uses historical patterns only when data exists; never fabricates lift.
 */

export interface RankableVariant {
  id: string;
  key: string;
  /** Higher = more often selected or used in history (optional). */
  historicalScore?: number;
}

/** Stable sort by historicalScore desc, then key; if no scores, preserve input order. */
export function rankTitleVariants(variants: RankableVariant[]): RankableVariant[] {
  return rankByHistoricalScore(variants);
}

export function rankClipCandidates(variants: RankableVariant[]): RankableVariant[] {
  return rankByHistoricalScore(variants);
}

export function rankLaunchAssets(variants: RankableVariant[]): RankableVariant[] {
  return rankByHistoricalScore(variants);
}

function rankByHistoricalScore(variants: RankableVariant[]): RankableVariant[] {
  const hasAny = variants.some((v) => v.historicalScore != null && !Number.isNaN(v.historicalScore));
  if (!hasAny) return [...variants];
  return [...variants].sort((a, b) => {
    const sa = a.historicalScore ?? 0;
    const sb = b.historicalScore ?? 0;
    if (sb !== sa) return sb - sa;
    return a.key.localeCompare(b.key);
  });
}
