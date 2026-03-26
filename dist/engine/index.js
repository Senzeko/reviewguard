/**
 * src/engine/index.ts
 *
 * ForensicMatchEngine — the scoring core of ReviewGuard AI.
 * Takes a Google Review and candidate POS transactions, returns a
 * ForensicMatchResult with a 0–100 composite confidence score.
 */
import { computeIdentityScore } from './factors/identity.js';
import { computeTemporalScore } from './factors/temporal.js';
import { computeLineItemScore } from './factors/lineItem.js';
export class ForensicMatchEngine {
    /**
     * Score a review against a set of candidate transactions.
     * Never throws — returns a safe fallback on unexpected error.
     */
    async match(review, transactions) {
        try {
            // 1. No transactions → NO_RECORD
            if (transactions.length === 0) {
                return {
                    confidence_score: 0,
                    match_status: 'NO_RECORD',
                    llm_inference_flag: false,
                    matched_transaction_id: null,
                    factor_breakdown: {
                        identity: {
                            score: 0,
                            level: 'NO_DATA',
                            detail: 'No transactions found in 14-day window',
                            jaro_winkler_score: 0,
                            reviewer_name: review.reviewerDisplayName,
                            customer_name: null,
                            name_window_expired: false,
                        },
                        temporal: {
                            score: 0,
                            level: 'NONE',
                            detail: 'No transactions found in 14-day window',
                            delta_hours: 0,
                            review_published_at: review.reviewPublishedAt.toISOString(),
                            transaction_closed_at: '',
                        },
                        line_item: {
                            score: 0,
                            level: 'NONE',
                            detail: 'No transactions to compare against',
                            llm_extracted_items: [],
                            matched_items: [],
                            pos_items: [],
                            llm_raw_response: '',
                        },
                    },
                };
            }
            // 2. Select the best transaction (closest in time)
            const best = this.selectBestTransaction(review, transactions);
            if (!best) {
                // Should not happen if transactions.length > 0, but guard anyway
                throw new Error('selectBestTransaction returned null with non-empty list');
            }
            // 3. Resolve customer name — check if expired
            const now = new Date();
            const nameExpired = best.namePlainExpiresAt !== null && best.namePlainExpiresAt < now;
            const customerName = nameExpired || best.namePlainTemp === null
                ? null
                : best.namePlainTemp;
            // 4. Run all three factor computations sequentially
            const identityResult = computeIdentityScore(review.reviewerDisplayName, customerName);
            const temporalResult = computeTemporalScore(review.reviewPublishedAt, best.closedAt);
            const lineItemResult = await computeLineItemScore(review.reviewText, best.lineItems);
            // 5. Determine LLM inference flag
            const llmInferenceFlag = lineItemResult.llm_raw_response !== '';
            // 6. Compute composite score
            const compositeScore = this.computeCompositeScore(identityResult.score, temporalResult.score, lineItemResult.score);
            // 7. Determine match status
            const matchStatus = this.determineMatchStatus(compositeScore, identityResult, temporalResult, lineItemResult, true);
            return {
                confidence_score: compositeScore,
                match_status: matchStatus,
                llm_inference_flag: llmInferenceFlag,
                matched_transaction_id: best.id,
                factor_breakdown: {
                    identity: identityResult,
                    temporal: temporalResult,
                    line_item: lineItemResult,
                },
            };
        }
        catch (err) {
            console.error('[ForensicMatchEngine] Unexpected error:', err);
            return this.safeErrorFallback(review);
        }
    }
    /**
     * Select the transaction with the smallest time delta to the review.
     */
    selectBestTransaction(review, transactions) {
        if (transactions.length === 0)
            return null;
        let best = null;
        let bestDelta = Infinity;
        for (const txn of transactions) {
            const delta = Math.abs(review.reviewPublishedAt.getTime() - txn.closedAt.getTime());
            if (delta < bestDelta) {
                bestDelta = delta;
                best = txn;
            }
        }
        return best;
    }
    /**
     * Weighted composite: identity 40%, temporal 30%, line-item 30%.
     */
    computeCompositeScore(identityScore, temporalScore, lineItemScore) {
        return Math.round((identityScore * 0.4 + temporalScore * 0.3 + lineItemScore * 0.3) * 100);
    }
    /**
     * Determine match status from composite score and individual factor levels.
     */
    determineMatchStatus(score, identity, temporal, lineItem, hasTransactions) {
        // 1. No transactions
        if (!hasTransactions)
            return 'NO_RECORD';
        // 2. Line-item contradiction: items mentioned but not on receipt
        const extractedItems = lineItem
            .llm_extracted_items;
        if (lineItem.level === 'NONE' &&
            extractedItems &&
            extractedItems.length > 0) {
            return 'MISMATCH';
        }
        // 3. High confidence: score >= 75 and at least 2 HIGH factors
        const highCount = [identity, temporal, lineItem].filter((f) => f.level === 'HIGH').length;
        if (score >= 75 && highCount >= 2)
            return 'VERIFIED';
        // 4. Advisory range (50–74) — matched but lower confidence
        if (score >= 50)
            return 'VERIFIED';
        // 5. Weak match with transactions present → MISMATCH
        return 'MISMATCH';
    }
    safeErrorFallback(review) {
        return {
            confidence_score: 0,
            match_status: 'MISMATCH',
            llm_inference_flag: false,
            matched_transaction_id: null,
            factor_breakdown: {
                identity: {
                    score: 0,
                    level: 'NONE',
                    detail: 'Engine error \u2014 see logs',
                    jaro_winkler_score: 0,
                    reviewer_name: review.reviewerDisplayName,
                    customer_name: null,
                    name_window_expired: false,
                },
                temporal: {
                    score: 0,
                    level: 'NONE',
                    detail: 'Engine error \u2014 see logs',
                    delta_hours: 0,
                    review_published_at: review.reviewPublishedAt.toISOString(),
                    transaction_closed_at: '',
                },
                line_item: {
                    score: 0,
                    level: 'NONE',
                    detail: 'Engine error \u2014 see logs',
                    llm_extracted_items: [],
                    matched_items: [],
                    pos_items: [],
                    llm_raw_response: '',
                },
            },
        };
    }
}
//# sourceMappingURL=index.js.map