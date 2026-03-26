/**
 * src/server/routes/analytics.ts
 *
 * Analytics API — time-series data for review trends, scoring breakdown,
 * and dispute success rates.
 */

import type { FastifyInstance } from 'fastify';
import { eq, and, gte, lte, sql, count } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { reviewsInvestigation } from '../../db/schema.js';

export async function analyticsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/analytics/trends?days=30
  fastify.get<{
    Querystring: { days?: string };
  }>('/trends', async (request, reply) => {
    if (!request.user?.merchantId) {
      return reply.status(403).send({ error: 'No merchant linked' });
    }

    const days = Math.min(90, Math.max(7, parseInt(request.query.days ?? '30', 10) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        day: sql<string>`date_trunc('day', ${reviewsInvestigation.createdAt})::date::text`,
        cnt: count(),
      })
      .from(reviewsInvestigation)
      .where(
        and(
          eq(reviewsInvestigation.merchantId, request.user.merchantId),
          gte(reviewsInvestigation.createdAt, since),
        ),
      )
      .groupBy(sql`date_trunc('day', ${reviewsInvestigation.createdAt})`)
      .orderBy(sql`date_trunc('day', ${reviewsInvestigation.createdAt})`);

    return reply.send({ days, data: rows.map((r) => ({ date: r.day, reviews: Number(r.cnt) })) });
  });

  // GET /api/analytics/score-distribution
  fastify.get('/score-distribution', async (request, reply) => {
    if (!request.user?.merchantId) {
      return reply.status(403).send({ error: 'No merchant linked' });
    }

    const rows = await db
      .select({
        bucket: sql<string>`
          CASE
            WHEN ${reviewsInvestigation.confidenceScore} IS NULL THEN 'unscored'
            WHEN ${reviewsInvestigation.confidenceScore} >= 75 THEN '75-100'
            WHEN ${reviewsInvestigation.confidenceScore} >= 50 THEN '50-74'
            WHEN ${reviewsInvestigation.confidenceScore} >= 25 THEN '25-49'
            ELSE '0-24'
          END`,
        cnt: count(),
      })
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.merchantId, request.user.merchantId))
      .groupBy(sql`
          CASE
            WHEN ${reviewsInvestigation.confidenceScore} IS NULL THEN 'unscored'
            WHEN ${reviewsInvestigation.confidenceScore} >= 75 THEN '75-100'
            WHEN ${reviewsInvestigation.confidenceScore} >= 50 THEN '50-74'
            WHEN ${reviewsInvestigation.confidenceScore} >= 25 THEN '25-49'
            ELSE '0-24'
          END`);

    return reply.send({
      data: rows.map((r) => ({ bucket: r.bucket, count: Number(r.cnt) })),
    });
  });

  // GET /api/analytics/tier-breakdown
  fastify.get('/tier-breakdown', async (request, reply) => {
    if (!request.user?.merchantId) {
      return reply.status(403).send({ error: 'No merchant linked' });
    }

    const reviews = await db
      .select({
        matchStatus: reviewsInvestigation.matchStatus,
        confidenceScore: reviewsInvestigation.confidenceScore,
      })
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.merchantId, request.user.merchantId));

    let disputable = 0, advisory = 0, legitimate = 0, notReady = 0;
    for (const r of reviews) {
      const score = r.confidenceScore ?? 0;
      if (r.matchStatus === 'PENDING' || r.matchStatus === 'PROCESSING') { notReady++; continue; }
      if (score >= 75 && r.matchStatus === 'VERIFIED') legitimate++;
      else if (score >= 50 && r.matchStatus !== 'NO_RECORD') advisory++;
      else disputable++;
    }

    return reply.send({ disputable, advisory, legitimate, notReady });
  });

  // GET /api/analytics/dispute-rate
  fastify.get('/dispute-rate', async (request, reply) => {
    if (!request.user?.merchantId) {
      return reply.status(403).send({ error: 'No merchant linked' });
    }

    const reviews = await db
      .select({
        humanReviewedAt: reviewsInvestigation.humanReviewedAt,
        pdfGeneratedAt: reviewsInvestigation.pdfGeneratedAt,
        matchStatus: reviewsInvestigation.matchStatus,
      })
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.merchantId, request.user.merchantId));

    const total = reviews.length;
    const scored = reviews.filter((r) => r.matchStatus !== 'PENDING' && r.matchStatus !== 'PROCESSING').length;
    const confirmed = reviews.filter((r) => r.humanReviewedAt).length;
    const exported = reviews.filter((r) => r.pdfGeneratedAt).length;

    return reply.send({
      total,
      scored,
      confirmed,
      exported,
      confirmRate: scored > 0 ? Math.round((confirmed / scored) * 100) : 0,
      exportRate: confirmed > 0 ? Math.round((exported / confirmed) * 100) : 0,
    });
  });

  // GET /api/analytics/rating-breakdown
  fastify.get('/rating-breakdown', async (request, reply) => {
    if (!request.user?.merchantId) {
      return reply.status(403).send({ error: 'No merchant linked' });
    }

    const rows = await db
      .select({
        rating: reviewsInvestigation.reviewRating,
        cnt: count(),
      })
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.merchantId, request.user.merchantId))
      .groupBy(reviewsInvestigation.reviewRating)
      .orderBy(reviewsInvestigation.reviewRating);

    return reply.send({
      data: rows.map((r) => ({ rating: r.rating, count: Number(r.cnt) })),
    });
  });
}
