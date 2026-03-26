/**
 * src/server/routes/dashboard.ts
 *
 * Merchant dashboard — paginated investigations list and stats.
 */

import type { FastifyInstance } from 'fastify';
import { eq, sql, count, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { reviewsInvestigation, merchants } from '../../db/schema.js';

type ConsoleTier = 'LEGITIMATE' | 'ADVISORY' | 'DISPUTABLE' | 'NOT_READY';

function computeConsoleTier(matchStatus: string, confidenceScore: number | null): ConsoleTier {
  if (matchStatus === 'PENDING' || matchStatus === 'PROCESSING') return 'NOT_READY';
  const score = confidenceScore ?? 0;
  if (score >= 75 && matchStatus === 'VERIFIED') return 'LEGITIMATE';
  if (score >= 50 && matchStatus !== 'NO_RECORD') return 'ADVISORY';
  return 'DISPUTABLE';
}

export async function dashboardRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/dashboard/stats
  fastify.get('/stats', async (request, reply) => {
    if (!request.user?.merchantId) {
      return reply.status(403).send({ error: 'No merchant linked to account' });
    }

    const merchantId = request.user.merchantId;

    const rows = await db
      .select({
        matchStatus: reviewsInvestigation.matchStatus,
        cnt: count(),
      })
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.merchantId, merchantId))
      .groupBy(reviewsInvestigation.matchStatus);

    let total = 0;
    let pending = 0;
    let verified = 0;
    let mismatch = 0;
    let noRecord = 0;

    for (const row of rows) {
      const c = Number(row.cnt);
      total += c;
      if (row.matchStatus === 'PENDING' || row.matchStatus === 'PROCESSING') pending += c;
      else if (row.matchStatus === 'VERIFIED') verified += c;
      else if (row.matchStatus === 'MISMATCH') mismatch += c;
      else if (row.matchStatus === 'NO_RECORD') noRecord += c;
    }

    const stats = { total, pending, verified, mismatch, noRecord };

    return reply.send(stats);
  });

  // GET /api/dashboard/investigations
  fastify.get<{
    Querystring: { status?: string; page?: string; limit?: string };
  }>('/investigations', async (request, reply) => {
    if (!request.user?.merchantId) {
      return reply.status(403).send({ error: 'No merchant linked to account' });
    }

    const merchantId = request.user.merchantId;
    const page = Math.max(1, parseInt(request.query.page ?? '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(request.query.limit ?? '20', 10) || 20));
    const offset = (page - 1) * limit;
    const statusFilter = request.query.status;

    // Build conditions
    const conditions = [eq(reviewsInvestigation.merchantId, merchantId)];
    if (statusFilter && ['VERIFIED', 'MISMATCH', 'NO_RECORD', 'PENDING', 'PROCESSING'].includes(statusFilter)) {
      conditions.push(eq(reviewsInvestigation.matchStatus, statusFilter as any));
    }

    const whereClause = conditions.length === 1 ? conditions[0]! : and(...conditions);

    const [items, totalRows] = await Promise.all([
      db
        .select()
        .from(reviewsInvestigation)
        .where(whereClause)
        .orderBy(sql`${reviewsInvestigation.createdAt} DESC`)
        .limit(limit)
        .offset(offset),
      db
        .select({ cnt: count() })
        .from(reviewsInvestigation)
        .where(whereClause),
    ]);

    const total = Number(totalRows[0]?.cnt ?? 0);

    return reply.send({
      items: items.map((inv) => ({
        id: inv.id,
        caseId: inv.caseId,
        reviewerDisplayName: inv.reviewerDisplayName,
        reviewRating: inv.reviewRating,
        reviewPublishedAt: inv.reviewPublishedAt.toISOString(),
        confidenceScore: inv.confidenceScore,
        matchStatus: inv.matchStatus,
        consoleTier: computeConsoleTier(inv.matchStatus, inv.confidenceScore),
        humanReviewedAt: inv.humanReviewedAt?.toISOString() ?? null,
        createdAt: inv.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    });
  });

  // GET /api/dashboard/merchant
  fastify.get('/merchant', async (request, reply) => {
    if (!request.user?.merchantId) {
      return reply.status(403).send({ error: 'No merchant linked to account' });
    }

    const rows = await db
      .select()
      .from(merchants)
      .where(eq(merchants.id, request.user.merchantId))
      .limit(1);

    const m = rows[0];
    if (!m) return reply.status(404).send({ error: 'Merchant not found' });

    return reply.send({
      id: m.id,
      businessName: m.businessName,
      googlePlaceId: m.googlePlaceId,
      posProvider: m.posProvider,
      isActive: m.isActive,
      lastSyncAt: m.lastSyncAt?.toISOString() ?? null,
      webhookSecret: m.webhookSecret,
      webhookUrl: '/webhooks/google-review',
    });
  });
}
