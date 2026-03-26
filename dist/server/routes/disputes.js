/**
 * src/server/routes/disputes.ts
 *
 * POST /disputes/:investigationId/export — trigger PDF generation
 * GET  /disputes/:investigationId/pdf   — download generated PDF
 */
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { reviewsInvestigation } from '../../db/schema.js';
import { enqueue, JobType } from '../../queue/jobs.js';
import { retrievePdf, pdfExists } from '../../pdf/vault.js';
export async function disputeRoutes(fastify) {
    // POST /disputes/:investigationId/export
    fastify.post('/disputes/:investigationId/export', async (request, reply) => {
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
        if (review.matchStatus === 'PENDING' || review.matchStatus === 'PROCESSING') {
            return reply.status(409).send({
                error: 'Review not yet scored',
                matchStatus: review.matchStatus,
            });
        }
        if (!review.humanReviewedAt) {
            return reply.status(403).send({
                error: 'Human review required before PDF export (ADMT compliance)',
            });
        }
        if (await pdfExists(investigationId)) {
            return reply.status(200).send({
                status: 'already_generated',
                caseId: review.caseId,
            });
        }
        await enqueue('PDF', {
            type: JobType.GENERATE_DISPUTE_PDF,
            investigationId,
            merchantId: review.merchantId,
        });
        return reply.status(202).send({
            status: 'queued',
            pollUrl: `/disputes/${investigationId}/pdf`,
        });
    });
    // GET /disputes/:investigationId/pdf
    fastify.get('/disputes/:investigationId/pdf', async (request, reply) => {
        const { investigationId } = request.params;
        const rows = await db
            .select({
            humanReviewedAt: reviewsInvestigation.humanReviewedAt,
        })
            .from(reviewsInvestigation)
            .where(eq(reviewsInvestigation.id, investigationId))
            .limit(1);
        const review = rows[0];
        if (!review) {
            return reply.status(404).send({ error: 'Investigation not found' });
        }
        if (!review.humanReviewedAt) {
            return reply.status(403).send({
                error: 'Human review required before PDF download',
            });
        }
        const result = await retrievePdf(investigationId);
        if (!result) {
            return reply.status(404).send({
                status: 'not_ready',
                message: 'PDF generation in progress. Poll this endpoint.',
            });
        }
        return reply
            .header('Content-Type', 'application/pdf')
            .header('Content-Disposition', `attachment; filename="ReviewGuard-${result.caseId}.pdf"`)
            .header('Cache-Control', 'private, no-cache')
            .send(result.pdfBytes);
    });
}
//# sourceMappingURL=disputes.js.map