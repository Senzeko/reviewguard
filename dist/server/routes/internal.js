/**
 * src/server/routes/internal.ts
 *
 * POST /internal/engine/test-match — dev-only endpoint for Session 6 integration tests.
 * Returns ForensicMatchResult without writing to the database.
 */
import { eq, and, gte, lte } from 'drizzle-orm';
import { env } from '../../env.js';
import { db } from '../../db/index.js';
import { reviewsInvestigation, transactionsVault, } from '../../db/schema.js';
import { ForensicMatchEngine } from '../../engine/index.js';
export async function internalRoutes(app) {
    app.post('/engine/test-match', async (request, reply) => {
        // Guard: dev/test only
        if (env.NODE_ENV === 'production') {
            return reply.status(404).send({ error: 'Not found' });
        }
        const { reviewId } = request.body;
        if (!reviewId) {
            return reply.status(400).send({ error: 'reviewId is required' });
        }
        // Fetch review
        const [review] = await db
            .select()
            .from(reviewsInvestigation)
            .where(eq(reviewsInvestigation.id, reviewId))
            .limit(1);
        if (!review) {
            return reply.status(404).send({ error: 'Review not found' });
        }
        // Fetch candidate transactions (14-day window)
        const windowStart = new Date(review.reviewPublishedAt.getTime() - 14 * 24 * 60 * 60 * 1000);
        const windowEnd = new Date(review.reviewPublishedAt.getTime() + 1 * 24 * 60 * 60 * 1000);
        const transactions = await db
            .select()
            .from(transactionsVault)
            .where(and(eq(transactionsVault.merchantId, review.merchantId), gte(transactionsVault.closedAt, windowStart), lte(transactionsVault.closedAt, windowEnd)));
        const engine = new ForensicMatchEngine();
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
        return reply.status(200).send(result);
    });
}
//# sourceMappingURL=internal.js.map