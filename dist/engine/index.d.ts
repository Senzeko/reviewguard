/**
 * src/engine/index.ts
 *
 * ForensicMatchEngine — the scoring core of ReviewGuard AI.
 * Takes a Google Review and candidate POS transactions, returns a
 * ForensicMatchResult with a 0–100 composite confidence score.
 */
import type { ForensicMatchResult } from './types.js';
interface ReviewInput {
    id: string;
    reviewerDisplayName: string;
    reviewText: string;
    reviewPublishedAt: Date;
    merchantId: string;
}
interface TransactionInput {
    id: string;
    namePlainTemp: string | null;
    namePlainExpiresAt: Date | null;
    lineItems: Array<{
        name: string;
        quantity: number;
        price_cents: number;
    }>;
    closedAt: Date;
}
export declare class ForensicMatchEngine {
    /**
     * Score a review against a set of candidate transactions.
     * Never throws — returns a safe fallback on unexpected error.
     */
    match(review: ReviewInput, transactions: TransactionInput[]): Promise<ForensicMatchResult>;
    /**
     * Select the transaction with the smallest time delta to the review.
     */
    private selectBestTransaction;
    /**
     * Weighted composite: identity 40%, temporal 30%, line-item 30%.
     */
    private computeCompositeScore;
    /**
     * Determine match status from composite score and individual factor levels.
     */
    private determineMatchStatus;
    private safeErrorFallback;
}
export {};
//# sourceMappingURL=index.d.ts.map