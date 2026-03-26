/**
 * src/server/routes/webhooks.ts
 *
 * POST /webhooks/google-review — Google Review webhook handler.
 */
import { createHmac } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { merchants, reviewsInvestigation } from '../../db/schema.js';
import { enqueue, JobType } from '../../queue/jobs.js';
export async function webhookRoutes(app) {
    // We need the raw body for HMAC verification.
    // Fastify parses JSON automatically, so we add a content type parser to
    // capture the raw buffer alongside the parsed body.
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
        try {
            const parsed = JSON.parse(body);
            done(null, parsed);
        }
        catch (err) {
            done(err, undefined);
        }
    });
    app.addHook('preHandler', async (request) => {
        // Store raw body string for HMAC verification
        // The body is the raw string because of our custom parser above
        request['rawBody'] =
            typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    });
    app.post('/google-review', async (request, reply) => {
        try {
            const body = request.body;
            // 1. Look up merchant by placeId
            const [merchant] = await db
                .select()
                .from(merchants)
                .where(eq(merchants.googlePlaceId, body.placeId))
                .limit(1);
            if (!merchant) {
                return reply.status(404).send({ error: 'Unknown placeId' });
            }
            // 2. HMAC verification
            const signature = request.headers['x-google-signature'];
            if (!signature) {
                request.log.warn({ placeId: body.placeId }, 'Missing X-Google-Signature header');
                return reply.status(401).send({ error: 'Missing signature' });
            }
            const rawBody = request['rawBody'];
            const expectedSig = createHmac('sha256', merchant.webhookSecret)
                .update(rawBody)
                .digest('hex');
            if (signature !== expectedSig) {
                request.log.warn({ placeId: body.placeId }, 'Invalid webhook signature');
                return reply.status(401).send({ error: 'Invalid signature' });
            }
            // 3. Idempotency check
            const [existing] = await db
                .select({ id: reviewsInvestigation.id })
                .from(reviewsInvestigation)
                .where(eq(reviewsInvestigation.googleReviewId, body.reviewId))
                .limit(1);
            if (existing) {
                return reply.status(200).send({ status: 'already_processed' });
            }
            // 4. Insert review
            await db.insert(reviewsInvestigation).values({
                merchantId: merchant.id,
                googleReviewId: body.reviewId,
                reviewerDisplayName: body.reviewerDisplayName,
                reviewText: body.reviewText,
                reviewRating: body.reviewRating,
                reviewPublishedAt: new Date(body.publishedAt),
                matchStatus: 'PENDING',
                auditLog: [
                    {
                        event: 'WEBHOOK_RECEIVED',
                        actor: 'ingress',
                        ts: new Date().toISOString(),
                        detail: `Review from ${body.reviewerDisplayName} (rating: ${body.reviewRating})`,
                    },
                ],
            });
            // 5. Enqueue job
            await enqueue('REVIEWS', {
                type: JobType.PROCESS_NEW_REVIEW,
                merchantId: merchant.id,
                googleReviewId: body.reviewId,
                reviewerDisplayName: body.reviewerDisplayName,
                reviewText: body.reviewText,
                reviewRating: body.reviewRating,
                reviewPublishedAt: body.publishedAt,
            });
            return reply.status(200).send({ status: 'accepted' });
        }
        catch (err) {
            request.log.error(err, 'Webhook handler error');
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });
}
//# sourceMappingURL=webhooks.js.map