/**
 * src/engine/factors/lineItem.ts
 *
 * LLM-based entity extraction from review text + item comparison against POS line items.
 */
import type { LineItemFactorResult } from '../types.js';
/**
 * Pure function: compares extracted items against POS items.
 * Exported for unit testing.
 */
export declare function matchItems(extractedItems: string[], posItems: string[]): {
    matched: string[];
    matchType: 'EXACT' | 'PARTIAL' | 'NONE';
};
export declare function computeLineItemScore(reviewText: string, posLineItems: Array<{
    name: string;
}>): Promise<LineItemFactorResult>;
//# sourceMappingURL=lineItem.d.ts.map