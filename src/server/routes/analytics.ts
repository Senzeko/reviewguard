/**
 * src/server/routes/analytics.ts
 *
 * Analytics API — time-series data for review trends, scoring breakdown,
 * and dispute success rates.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { eq, and, gte, sql, count, isNotNull, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { isMissingSchemaError } from '../../db/podsignalSchemaStatus.js';
import {
  reviewsInvestigation,
  podcasts,
  episodes,
  campaigns,
  campaignTasks,
  podsignalHostMetricSnapshots,
} from '../../db/schema.js';

const HOST_METRIC_KEYS = [
  'spotify_streams_7d',
  'apple_plays_7d',
  'youtube_views_7d',
  'rss_downloads_7d',
  'newsletter_opens',
  'other',
] as const;

const hostMetricBodySchema = z
  .object({
    metricKey: z.enum(HOST_METRIC_KEYS),
    customLabel: z.string().max(80).optional().nullable(),
    value: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    sourceNote: z.string().max(500).optional().nullable(),
    episodeId: z.string().uuid().optional().nullable(),
  })
  .refine(
    (d) =>
      d.metricKey !== 'other' ||
      (typeof d.customLabel === 'string' && d.customLabel.trim().length > 0),
    { message: 'customLabel is required when metricKey is other', path: ['customLabel'] },
  );

function hostMetricsUnavailable(reply: FastifyReply) {
  return reply.status(503).send({
    error: 'Host metrics schema missing',
    code: 'PODSIGNAL_HOST_METRICS_SCHEMA_MISSING',
    migrationHint: 'Run npm run db:apply-0014 (migrations/0014_host_metric_snapshots.sql)',
  });
}

async function episodeOwnedByUser(episodeId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: episodes.id })
    .from(episodes)
    .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
    .where(and(eq(episodes.id, episodeId), eq(podcasts.ownerId, userId)))
    .limit(1);
  return !!row;
}

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

  // GET /api/analytics/podsignal-summary — workspace growth snapshot (shows / episodes / campaigns)
  fastify.get('/podsignal-summary', async (request, reply) => {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const [showCount] = await db
      .select({ c: count() })
      .from(podcasts)
      .where(eq(podcasts.ownerId, userId));

    const [episodeCount] = await db
      .select({ c: count() })
      .from(episodes)
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(eq(podcasts.ownerId, userId));

    const statusRows = await db
      .select({
        status: episodes.status,
        c: count(),
      })
      .from(episodes)
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(eq(podcasts.ownerId, userId))
      .groupBy(episodes.status);

    const [activeCampaigns] = await db
      .select({ c: count() })
      .from(campaigns)
      .innerJoin(episodes, eq(campaigns.episodeId, episodes.id))
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(and(eq(podcasts.ownerId, userId), eq(campaigns.status, 'ACTIVE')));

    const [tasksTotal] = await db
      .select({ c: count() })
      .from(campaignTasks)
      .innerJoin(campaigns, eq(campaignTasks.campaignId, campaigns.id))
      .innerJoin(episodes, eq(campaigns.episodeId, episodes.id))
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(eq(podcasts.ownerId, userId));

    const [tasksDone] = await db
      .select({ c: count() })
      .from(campaignTasks)
      .innerJoin(campaigns, eq(campaignTasks.campaignId, campaigns.id))
      .innerJoin(episodes, eq(campaigns.episodeId, episodes.id))
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(and(eq(podcasts.ownerId, userId), isNotNull(campaignTasks.doneAt)));

    return reply.send({
      shows: Number(showCount?.c ?? 0),
      episodes: Number(episodeCount?.c ?? 0),
      episodesByStatus: Object.fromEntries(statusRows.map((r) => [r.status, Number(r.c)])),
      activeCampaigns: Number(activeCampaigns?.c ?? 0),
      launchTasksDone: Number(tasksDone?.c ?? 0),
      launchTasksTotal: Number(tasksTotal?.c ?? 0),
    });
  });

  // GET /api/analytics/episode-options — one query for host-metric dropdown (avoids N+1 client freeze)
  fastify.get<{
    Querystring: { limit?: string };
  }>('/episode-options', async (request, reply) => {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }
    const limit = Math.min(500, Math.max(1, parseInt(request.query.limit ?? '300', 10) || 300));

    const rows = await db
      .select({
        id: episodes.id,
        episodeTitle: episodes.title,
        podcastTitle: podcasts.title,
      })
      .from(episodes)
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(eq(podcasts.ownerId, userId))
      .orderBy(desc(episodes.createdAt))
      .limit(limit);

    return reply.send({
      options: rows.map((r) => ({
        id: r.id,
        label: `${r.podcastTitle}: ${r.episodeTitle}`,
      })),
    });
  });

  // GET /api/analytics/host-snapshots — self-reported host metrics (user-entered)
  fastify.get<{
    Querystring: { limit?: string };
  }>('/host-snapshots', async (request, reply) => {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? '50', 10) || 50));
    try {
      const rows = await db
        .select({
          id: podsignalHostMetricSnapshots.id,
          metricKey: podsignalHostMetricSnapshots.metricKey,
          customLabel: podsignalHostMetricSnapshots.customLabel,
          value: podsignalHostMetricSnapshots.value,
          sourceNote: podsignalHostMetricSnapshots.sourceNote,
          episodeId: podsignalHostMetricSnapshots.episodeId,
          createdAt: podsignalHostMetricSnapshots.createdAt,
          episodeTitle: episodes.title,
        })
        .from(podsignalHostMetricSnapshots)
        .leftJoin(episodes, eq(podsignalHostMetricSnapshots.episodeId, episodes.id))
        .where(eq(podsignalHostMetricSnapshots.userId, userId))
        .orderBy(desc(podsignalHostMetricSnapshots.createdAt))
        .limit(limit);

      return reply.send({
        snapshots: rows.map((r) => ({
          id: r.id,
          metricKey: r.metricKey,
          customLabel: r.customLabel,
          value: Number(r.value),
          sourceNote: r.sourceNote,
          episodeId: r.episodeId,
          episodeTitle: r.episodeTitle,
          createdAt: r.createdAt.toISOString(),
          evidence: 'self_reported' as const,
        })),
      });
    } catch (e: unknown) {
      if (isMissingSchemaError(e)) {
        return hostMetricsUnavailable(reply);
      }
      throw e;
    }
  });

  // POST /api/analytics/host-snapshots
  fastify.post('/host-snapshots', async (request, reply) => {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }
    const parsed = hostMetricBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }
    const { metricKey, customLabel, value, sourceNote, episodeId } = parsed.data;
    if (episodeId) {
      const ok = await episodeOwnedByUser(episodeId, userId);
      if (!ok) {
        return reply.status(403).send({ error: 'Episode not found or not yours' });
      }
    }
    try {
      const [row] = await db
        .insert(podsignalHostMetricSnapshots)
        .values({
          userId,
          episodeId: episodeId ?? null,
          metricKey,
          customLabel: metricKey === 'other' ? customLabel!.trim() : null,
          value,
          sourceNote: (sourceNote ?? '').trim(),
        })
        .returning({
          id: podsignalHostMetricSnapshots.id,
          createdAt: podsignalHostMetricSnapshots.createdAt,
        });
      return reply.status(201).send({
        id: row!.id,
        metricKey,
        customLabel: metricKey === 'other' ? customLabel!.trim() : null,
        value,
        sourceNote: (sourceNote ?? '').trim(),
        episodeId: episodeId ?? null,
        createdAt: row!.createdAt.toISOString(),
        evidence: 'self_reported' as const,
      });
    } catch (e: unknown) {
      if (isMissingSchemaError(e)) {
        return hostMetricsUnavailable(reply);
      }
      throw e;
    }
  });

  // DELETE /api/analytics/host-snapshots/:id
  fastify.delete<{
    Params: { id: string };
  }>('/host-snapshots/:id', async (request, reply) => {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }
    const id = request.params.id;
    if (!z.string().uuid().safeParse(id).success) {
      return reply.status(400).send({ error: 'Invalid id' });
    }
    try {
      const deleted = await db
        .delete(podsignalHostMetricSnapshots)
        .where(
          and(eq(podsignalHostMetricSnapshots.id, id), eq(podsignalHostMetricSnapshots.userId, userId)),
        )
        .returning({ id: podsignalHostMetricSnapshots.id });
      if (!deleted.length) {
        return reply.status(404).send({ error: 'Not found' });
      }
      return reply.send({ ok: true });
    } catch (e: unknown) {
      if (isMissingSchemaError(e)) {
        return hostMetricsUnavailable(reply);
      }
      throw e;
    }
  });
}
