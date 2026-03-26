/**
 * src/server/routes/console.ts
 *
 * Backend API routes for the Reviewer Console (Session 5).
 *
 * GET  /api/console/investigations/:investigationId       — full investigation data
 * POST /api/console/investigations/:investigationId/confirm — merchant confirms review
 * GET  /api/console/investigations/:investigationId/pdf-status — poll for PDF readiness
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { reviewsInvestigation, merchants, transactionsVault, } from '../../db/schema.js';
import { enqueue, JobType } from '../../queue/jobs.js';
import { pdfExists } from '../../pdf/vault.js';
function computeConsoleTier(matchStatus, confidenceScore) {
    if (matchStatus === 'PENDING' || matchStatus === 'PROCESSING')
        return 'NOT_READY';
    const score = confidenceScore ?? 0;
    // High confidence match to a real customer → legitimate review, no dispute
    if (score >= 75 && matchStatus === 'VERIFIED')
        return 'LEGITIMATE';
    // Medium confidence → advisory, proceed with caution
    if (score >= 50 && matchStatus !== 'NO_RECORD')
        return 'ADVISORY';
    // Low score, NO_RECORD, or MISMATCH with low confidence → disputable
    return 'DISPUTABLE';
}
export async function consoleRoutes(fastify) {
    // GET /api/console/investigations/:investigationId
    fastify.get('/investigations/:investigationId', async (request, reply) => {
        const { investigationId } = request.params;
        const rows = await db
            .select()
            .from(reviewsInvestigation)
            .where(eq(reviewsInvestigation.id, investigationId))
            .limit(1);
        const review = rows[0];
        if (!review) {
            return reply.status(404).send({ error: 'Investigation not found' });
        }
        const merchantRows = await db
            .select()
            .from(merchants)
            .where(eq(merchants.id, review.merchantId))
            .limit(1);
        const merchant = merchantRows[0];
        if (!merchant) {
            return reply.status(404).send({ error: 'Merchant not found' });
        }
        let matchedTransaction = null;
        if (review.matchedTransactionId) {
            const txnRows = await db
                .select()
                .from(transactionsVault)
                .where(eq(transactionsVault.id, review.matchedTransactionId))
                .limit(1);
            const txn = txnRows[0];
            if (txn) {
                matchedTransaction = {
                    posTransactionId: txn.posTransactionId,
                    posProvider: txn.posProvider,
                    closedAt: txn.closedAt.toISOString(),
                    lineItems: txn.lineItems,
                    transactionAmountCents: txn.transactionAmountCents,
                };
            }
        }
        const consoleTier = computeConsoleTier(review.matchStatus, review.confidenceScore);
        return reply.send({
            investigationId: review.id,
            caseId: review.caseId ?? null,
            merchantBusinessName: merchant.businessName,
            googlePlaceId: merchant.googlePlaceId,
            googleReviewId: review.googleReviewId,
            reviewerDisplayName: review.reviewerDisplayName,
            reviewText: review.reviewText,
            reviewRating: review.reviewRating,
            reviewPublishedAt: review.reviewPublishedAt.toISOString(),
            confidenceScore: review.confidenceScore ?? 0,
            matchStatus: review.matchStatus,
            llmInferenceFlag: review.llmInferenceFlag,
            consoleTier,
            factorBreakdown: review.factorBreakdown ?? null,
            matchedTransaction,
            humanReviewedAt: review.humanReviewedAt?.toISOString() ?? null,
            humanReviewerId: review.humanReviewerId ?? null,
            disputeExportedAt: review.disputeExportedAt?.toISOString() ?? null,
            pdfGeneratedAt: review.pdfGeneratedAt?.toISOString() ?? null,
        });
    });
    // POST /api/console/investigations/:investigationId/confirm
    fastify.post('/investigations/:investigationId/confirm', async (request, reply) => {
        const { investigationId } = request.params;
        const { acknowledgedSections } = request.body ?? {};
        // Use session user if available, fall back to body-supplied ID (for tests)
        const merchantUserId = request.user?.userId ?? request.body?.merchantUserId;
        if (!merchantUserId || !Array.isArray(acknowledgedSections)) {
            return reply.status(400).send({ error: 'Missing merchantUserId or acknowledgedSections' });
        }
        const required = [1, 2, 3, 4, 5];
        const sorted = [...acknowledgedSections].sort();
        if (sorted.length !== 5 ||
            !sorted.every((v, i) => v === required[i])) {
            return reply.status(400).send({
                error: 'acknowledgedSections must contain exactly [1, 2, 3, 4, 5]',
            });
        }
        const rows = await db
            .select()
            .from(reviewsInvestigation)
            .where(eq(reviewsInvestigation.id, investigationId))
            .limit(1);
        const review = rows[0];
        if (!review) {
            return reply.status(404).send({ error: 'Investigation not found' });
        }
        if (review.matchStatus === 'PENDING' || review.matchStatus === 'PROCESSING') {
            return reply.status(409).send({ error: 'Review not yet scored' });
        }
        if (review.humanReviewedAt) {
            return reply.status(409).send({ error: 'Already confirmed' });
        }
        const score = review.confidenceScore ?? 0;
        if (score >= 75 && review.matchStatus === 'VERIFIED') {
            return reply.status(403).send({
                error: 'Cannot dispute legitimate customer reviews (confidence >= 75, verified match)',
            });
        }
        const now = new Date();
        await db
            .update(reviewsInvestigation)
            .set({
            humanReviewedAt: now,
            humanReviewerId: merchantUserId,
            updatedAt: now,
            auditLog: sql `${reviewsInvestigation.auditLog} || ${JSON.stringify([
                {
                    event: 'HUMAN_CONFIRMED',
                    actor: merchantUserId,
                    ts: now.toISOString(),
                    detail: 'Sections acknowledged: 1,2,3,4,5',
                },
            ])}::jsonb`,
        })
            .where(eq(reviewsInvestigation.id, investigationId));
        await enqueue('PDF', {
            type: JobType.GENERATE_DISPUTE_PDF,
            investigationId,
            merchantId: review.merchantId,
        });
        return reply.send({
            status: 'confirmed',
            human_reviewed_at: now.toISOString(),
            pdf_poll_url: `/disputes/${investigationId}/pdf`,
        });
    });
    // GET /api/console/investigations/:investigationId/pdf-status
    fastify.get('/investigations/:investigationId/pdf-status', async (request, reply) => {
        const { investigationId } = request.params;
        const exists = await pdfExists(investigationId);
        if (exists) {
            return reply.send({
                status: 'ready',
                downloadUrl: `/disputes/${investigationId}/pdf`,
            });
        }
        return reply.send({ status: 'pending' });
    });
}
//# sourceMappingURL=console.js.map