/**
 * src/engine/worker.ts
 *
 * ForensicMatchEngine worker loop — polls for PENDING reviews in the DB,
 * claims them as PROCESSING, runs the engine, and writes results back.
 */
import { eq, and, gte, lte, lt, sql, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { reviewsInvestigation, transactionsVault, } from '../db/schema.js';
import { ForensicMatchEngine } from './index.js';
const engine = new ForensicMatchEngine();
let _timer = null;
let _running = false;
let _processing = false;
/**
 * On startup, reset any rows stuck in PROCESSING for more than 5 minutes
 * back to PENDING (crash recovery).
 */
async function recoverStuckRows() {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const result = await db
        .update(reviewsInvestigation)
        .set({ matchStatus: 'PENDING' })
        .where(and(eq(reviewsInvestigation.matchStatus, 'PROCESSING'), lt(reviewsInvestigation.updatedAt, fiveMinAgo)))
        .returning({ id: reviewsInvestigation.id });
    if (result.length > 0) {
        console.log(`[engine] Recovered ${result.length} stuck PROCESSING reviews back to PENDING`);
    }
}
async function pollOnce() {
    if (_processing)
        return; // prevent overlapping polls
    _processing = true;
    try {
        // 1. Fetch up to 5 PENDING reviews
        const pending = await db
            .select()
            .from(reviewsInvestigation)
            .where(eq(reviewsInvestigation.matchStatus, 'PENDING'))
            .orderBy(asc(reviewsInvestigation.createdAt))
            .limit(5);
        if (pending.length === 0) {
            return;
        }
        for (const review of pending) {
            // a. Claim — set to PROCESSING
            await db
                .update(reviewsInvestigation)
                .set({ matchStatus: 'PROCESSING', updatedAt: new Date() })
                .where(eq(reviewsInvestigation.id, review.id));
            // b. Fetch candidate transactions (14-day window)
            const windowStart = new Date(review.reviewPublishedAt.getTime() - 14 * 24 * 60 * 60 * 1000);
            const windowEnd = new Date(review.reviewPublishedAt.getTime() + 1 * 24 * 60 * 60 * 1000);
            const transactions = await db
                .select()
                .from(transactionsVault)
                .where(and(eq(transactionsVault.merchantId, review.merchantId), gte(transactionsVault.closedAt, windowStart), lte(transactionsVault.closedAt, windowEnd)));
            // c. Run engine
            const result = await engine.match({
                id: review.id,
                reviewerDisplayName: review.reviewerDisplayName,
                reviewText: review.reviewText,
                reviewPublishedAt: review.reviewPublishedAt,
                merchantId: review.merchantId,
            }, transactions.map((t) => ({
                id: t.id,
                namePlainTemp: t.namePlainTemp,
                namePlainExpiresAt: t.namePlainExpiresAt,
                lineItems: t.lineItems,
                closedAt: t.closedAt,
            })));
            // d. Write results back
            const auditEntry = {
                event: 'ENGINE_SCORED',
                actor: 'forensic_engine',
                ts: new Date().toISOString(),
                detail: `Score: ${result.confidence_score} | Status: ${result.match_status} | LLM: ${result.llm_inference_flag}`,
            };
            await db
                .update(reviewsInvestigation)
                .set({
                confidenceScore: result.confidence_score,
                matchStatus: result.match_status,
                llmInferenceFlag: result.llm_inference_flag,
                matchedTransactionId: result.matched_transaction_id,
                factorBreakdown: result.factor_breakdown,
                auditLog: sql `${reviewsInvestigation.auditLog} || ${JSON.stringify([auditEntry])}::jsonb`,
                updatedAt: new Date(),
            })
                .where(eq(reviewsInvestigation.id, review.id));
            // e. Log
            console.log(`[engine] Review ${review.id} \u2192 score ${result.confidence_score}, status ${result.match_status}`);
        }
    }
    catch (err) {
        console.error('[engine] Worker poll error:', err);
    }
    finally {
        _processing = false;
    }
}
export async function startEngineWorker() {
    if (_running)
        return;
    _running = true;
    // Recover stuck rows from previous crashes
    await recoverStuckRows();
    console.log('[engine] Worker started \u2014 polling for PENDING reviews');
    _timer = setInterval(() => {
        void pollOnce();
    }, 1000);
}
export function stopEngineWorker() {
    _running = false;
    if (_timer) {
        clearInterval(_timer);
        _timer = null;
    }
    console.log('[engine] Worker stopped');
}
//# sourceMappingURL=worker.js.map