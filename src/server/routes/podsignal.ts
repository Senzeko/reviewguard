/**
 * PodSignal product routes — measurement taxonomy + output-usage + trackable links + report summary.
 */

import { randomBytes } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { and, count, desc, eq, gte, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import {
  episodes,
  podcasts,
  podsignalLinkClicks,
  podsignalOutputUsage,
  podsignalTrackableLinks,
} from '../../db/schema.js';
import {
  CLAIM_VOCABULARY,
  OUTPUT_USAGE_EVENT_TYPES,
  type OutputUsageEventType,
} from '../../podsignal/measurement.js';
import { buildPodsignalReportSummary } from '../../podsignal/buildReportSummary.js';
import {
  buildReportIdentifiersPayload,
  insertPodsignalReportExportLineage,
} from '../../podsignal/reportExportLineage.js';
import { fetchLaunchEvidenceForEpisode } from '../../podsignal/launchEvidenceGraph.js';
import { buildLaunchProofReport, buildSponsorProofSummary } from '../../podsignal/reportCompiler.js';
import { generateSponsorPodsignalPdf } from '../../pdf/sponsorPodsignalReport.js';
import { ensureLaunchEvidenceGraphSchema } from '../launchEvidenceGraphGuard.js';
import { ensurePodsignalPilotSchema, handlePodsignalPilotDbError } from '../podsignalPilotGuard.js';
import { getOrCreateCampaign } from './campaigns.js';

const createLinkSchema = z.object({
  episodeId: z.string().uuid(),
  assetKind: z.enum(['guest_share', 'newsletter', 'social', 'launch', 'other']),
  channel: z.string().max(64).optional().nullable(),
  targetUrl: z.string().url().max(4000),
});

function makeLinkToken(): string {
  return randomBytes(12).toString('base64url');
}

export async function podsignalRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/podsignal/title-preset-analytics?windowDays=30 — defaults/overrides by surface
  fastify.get<{
    Querystring: { windowDays?: string };
  }>('/title-preset-analytics', async (request, reply) => {
    if (!(await ensurePodsignalPilotSchema(reply))) return;
    const user = request.user;
    if (!user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const parsedWindow = parseInt(request.query.windowDays ?? '30', 10);
    const windowDays = Number.isFinite(parsedWindow) ? Math.min(90, Math.max(7, parsedWindow)) : 30;
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const events = await db
      .select({
        eventType: podsignalOutputUsage.eventType,
        payload: podsignalOutputUsage.payload,
      })
      .from(podsignalOutputUsage)
      .where(
        and(
          eq(podsignalOutputUsage.userId, user.userId),
          gte(podsignalOutputUsage.createdAt, since),
          inArray(podsignalOutputUsage.eventType, ['title_preset_default_applied', 'title_preset_overridden']),
        ),
      );

    const surfaces = {
      episodeDetail: { defaultsApplied: 0, overrides: 0, overrideRate: 0 },
      episodeLaunch: { defaultsApplied: 0, overrides: 0, overrideRate: 0 },
    };
    let totalDefaults = 0;
    let totalOverrides = 0;
    const transitionCounts = new Map<string, number>();

    for (const e of events) {
      const payload = (e.payload ?? {}) as { surface?: unknown };
      const surface =
        payload.surface === 'episode_detail'
          ? 'episodeDetail'
          : payload.surface === 'episode_launch'
            ? 'episodeLaunch'
            : null;

      if (e.eventType === 'title_preset_default_applied') {
        totalDefaults += 1;
        if (surface) surfaces[surface].defaultsApplied += 1;
      }
      if (e.eventType === 'title_preset_overridden') {
        totalOverrides += 1;
        if (surface) surfaces[surface].overrides += 1;
        const p = (e.payload ?? {}) as { kind?: unknown; from?: unknown; to?: unknown; surface?: unknown };
        const kind = typeof p.kind === 'string' ? p.kind : 'unknown';
        const from = typeof p.from === 'string' ? p.from : 'unknown';
        const to = typeof p.to === 'string' ? p.to : 'unknown';
        const s = typeof p.surface === 'string' ? p.surface : 'unknown';
        const key = `${kind}|${from}|${to}|${s}`;
        transitionCounts.set(key, (transitionCounts.get(key) ?? 0) + 1);
      }
    }

    const withRates = {
      episodeDetail: {
        ...surfaces.episodeDetail,
        overrideRate:
          surfaces.episodeDetail.defaultsApplied > 0
            ? Number((surfaces.episodeDetail.overrides / surfaces.episodeDetail.defaultsApplied).toFixed(4))
            : 0,
      },
      episodeLaunch: {
        ...surfaces.episodeLaunch,
        overrideRate:
          surfaces.episodeLaunch.defaultsApplied > 0
            ? Number((surfaces.episodeLaunch.overrides / surfaces.episodeLaunch.defaultsApplied).toFixed(4))
            : 0,
      },
    };

    const topOverrideTransitions = [...transitionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([key, count]) => {
        const [kind, from, to, surface] = key.split('|');
        return { kind, from, to, surface, count };
      });

    return reply.send({
      windowDays,
      totals: {
        defaultsApplied: totalDefaults,
        overrides: totalOverrides,
        overrideRate: totalDefaults > 0 ? Number((totalOverrides / totalDefaults).toFixed(4)) : 0,
      },
      surfaces: withRates,
      topOverrideTransitions,
    });
  });

  // GET /api/podsignal/trackable-links?episodeId= — list links for an episode (observed tokens)
  fastify.get<{
    Querystring: { episodeId?: string };
  }>('/trackable-links', async (request, reply) => {
    if (!(await ensurePodsignalPilotSchema(reply))) return;
    const user = request.user;
    if (!user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const episodeId = request.query.episodeId;
    if (!episodeId || !z.string().uuid().safeParse(episodeId).success) {
      return reply.status(400).send({ error: 'episodeId query required (uuid)' });
    }

    const owned = await db
      .select({ id: episodes.id })
      .from(episodes)
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(and(eq(episodes.id, episodeId), eq(podcasts.ownerId, user.userId)))
      .limit(1);
    if (!owned.length) {
      return reply.status(403).send({ error: 'Episode not found or not yours' });
    }

    let rows;
    try {
      rows = await db
        .select()
        .from(podsignalTrackableLinks)
        .where(
          and(eq(podsignalTrackableLinks.episodeId, episodeId), eq(podsignalTrackableLinks.ownerId, user.userId)),
        )
        .orderBy(desc(podsignalTrackableLinks.createdAt));
    } catch (e: unknown) {
      if (handlePodsignalPilotDbError(e, reply)) return;
      throw e;
    }

    const linkIds = rows.map((r) => r.id);
    const clickCountByLinkId = new Map<string, number>();
    if (linkIds.length > 0) {
      try {
        const clickAgg = await db
          .select({
            linkId: podsignalLinkClicks.linkId,
            c: count(),
          })
          .from(podsignalLinkClicks)
          .where(inArray(podsignalLinkClicks.linkId, linkIds))
          .groupBy(podsignalLinkClicks.linkId);
        for (const r of clickAgg) {
          clickCountByLinkId.set(r.linkId, Number(r.c));
        }
      } catch (e: unknown) {
        if (handlePodsignalPilotDbError(e, reply)) return;
        throw e;
      }
    }

    const withClicks = rows.map((row) => ({
      id: row.id,
      token: row.token,
      episodeId: row.episodeId,
      campaignId: row.campaignId,
      assetKind: row.assetKind,
      channel: row.channel,
      targetUrl: row.targetUrl,
      clicksObserved: clickCountByLinkId.get(row.id) ?? 0,
      evidence: 'observed' as const,
      createdAt: row.createdAt.toISOString(),
    }));

    const proto =
      (typeof request.headers['x-forwarded-proto'] === 'string'
        ? request.headers['x-forwarded-proto']
        : null) ?? 'http';
    const host =
      (typeof request.headers['x-forwarded-host'] === 'string'
        ? request.headers['x-forwarded-host']
        : null) ??
      request.headers.host ??
      'localhost:3000';

    return reply.send({
      links: withClicks.map((l) => ({
        ...l,
        publicUrl: `${proto}://${host}/r/${l.token}`,
      })),
    });
  });

  // GET /api/podsignal/measurement-taxonomy — safe for client bundling / docs
  fastify.get('/measurement-taxonomy', async (_request, reply) => {
    return reply.send({
      evidenceLevels: ['observed', 'proxy', 'inferred', 'unsupported'] as const,
      claimVocabulary: CLAIM_VOCABULARY,
      outputUsageEventTypes: OUTPUT_USAGE_EVENT_TYPES,
    });
  });

  // GET /api/podsignal/report-summary — observed usage + clicks for sponsor / launch artifact
  fastify.get('/report-summary', async (request, reply) => {
    if (!(await ensurePodsignalPilotSchema(reply))) return;
    const user = request.user;
    if (!user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    try {
      const summary = await buildPodsignalReportSummary(user.userId);
      return reply.send(summary);
    } catch (e: unknown) {
      if (handlePodsignalPilotDbError(e, reply)) return;
      throw e;
    }
  });

  // GET /api/podsignal/sponsor-report.pdf — same data as report-summary, downloadable PDF
  fastify.get('/sponsor-report.pdf', async (request, reply) => {
    if (!(await ensurePodsignalPilotSchema(reply))) return;
    const user = request.user;
    if (!user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    try {
      const summary = await buildPodsignalReportSummary(user.userId);
      const pdfBytes = await generateSponsorPodsignalPdf(summary);

      let reportExportId: string | undefined;
      try {
        const lineage = await insertPodsignalReportExportLineage({
          ownerId: user.userId,
          episodeId: null,
          campaignId: null,
          reportType: 'sponsor_proof_workspace',
          exportFormat: 'pdf',
          exportedBy: user.userId,
          evidenceScores: summary.evidenceScores,
          reportIdentifiers: buildReportIdentifiersPayload(
            summary,
            'workspace_rolling_sponsor_proof',
            'pdf',
          ),
        });
        if (lineage) {
          reportExportId = lineage.id;
          request.log.info({ exportId: lineage.id }, '[podsignal] sponsor PDF export lineage recorded');
        } else {
          request.log.info(
            { reason: 'launch_evidence_graph_schema_unavailable' },
            '[podsignal] sponsor PDF export lineage skipped (apply 0017+0018 for podsignal_report_exports)',
          );
        }
      } catch (err: unknown) {
        request.log.warn({ err }, '[podsignal] sponsor PDF export lineage insert failed (non-fatal)');
      }

      await db.insert(podsignalOutputUsage).values({
        userId: user.userId,
        episodeId: null,
        eventType: 'sponsor_report_exported' as OutputUsageEventType,
        payload: {
          format: 'pdf',
          windowDays: summary.windowDays,
          ...(reportExportId ? { reportExportId } : {}),
        },
      });

      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', 'attachment; filename="podsignal-sponsor-proof.pdf"')
        .send(Buffer.from(pdfBytes));
    } catch (e: unknown) {
      if (handlePodsignalPilotDbError(e, reply)) return;
      throw e;
    }
  });

  // POST /api/podsignal/trackable-links — create redirect token (fires observed usage server-side)
  fastify.post('/trackable-links', async (request, reply) => {
    if (!(await ensurePodsignalPilotSchema(reply))) return;
    const user = request.user;
    if (!user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const parsed = createLinkSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.issues });
    }

    const { episodeId, assetKind, channel, targetUrl } = parsed.data;

    const owned = await db
      .select({ id: episodes.id })
      .from(episodes)
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(and(eq(episodes.id, episodeId), eq(podcasts.ownerId, user.userId)))
      .limit(1);
    if (!owned.length) {
      return reply.status(403).send({ error: 'Episode not found or not yours' });
    }

    const { campaign } = await getOrCreateCampaign(episodeId);

    let token = makeLinkToken();
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const [row] = await db
          .insert(podsignalTrackableLinks)
          .values({
            token,
            ownerId: user.userId,
            episodeId,
            campaignId: campaign.id,
            assetKind,
            channel: channel ?? null,
            targetUrl,
          })
          .returning();

        if (!row) {
          return reply.status(500).send({ error: 'Could not create link' });
        }

        await db.insert(podsignalOutputUsage).values({
          userId: user.userId,
          episodeId,
          eventType: 'trackable_link_created',
          payload: {
            linkId: row.id,
            token: row.token,
            assetKind,
            channel: channel ?? null,
            campaignId: campaign.id,
          },
        });

        const proto =
          (typeof request.headers['x-forwarded-proto'] === 'string'
            ? request.headers['x-forwarded-proto']
            : null) ?? 'http';
        const host =
          (typeof request.headers['x-forwarded-host'] === 'string'
            ? request.headers['x-forwarded-host']
            : null) ??
          request.headers.host ??
          'localhost:3000';
        const publicUrl = `${proto}://${host}/r/${row.token}`;

        request.log.info({ linkId: row.id, episodeId }, '[podsignal] trackable link created');
        return reply.send({
          id: row.id,
          token: row.token,
          publicUrl,
          episodeId: row.episodeId,
          campaignId: row.campaignId,
          assetKind: row.assetKind,
          evidence: 'observed' as const,
        });
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === '23505') {
          token = makeLinkToken();
          continue;
        }
        if (handlePodsignalPilotDbError(e, reply)) return;
        throw e;
      }
    }

    return reply.status(500).send({ error: 'Could not allocate unique token' });
  });

  // POST /api/podsignal/output-usage — track selected titles, exports, approvals (no PII in payload)
  fastify.post<{
    Body: { eventType: string; episodeId?: string | null; payload?: Record<string, unknown> };
  }>('/output-usage', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const { eventType, episodeId, payload } = request.body ?? {};
    if (!eventType || !(OUTPUT_USAGE_EVENT_TYPES as readonly string[]).includes(eventType)) {
      return reply.status(400).send({
        error: `eventType must be one of: ${OUTPUT_USAGE_EVENT_TYPES.join(', ')}`,
      });
    }

    if (episodeId) {
      const ownedEp = await db
        .select({ id: episodes.id })
        .from(episodes)
        .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
        .where(and(eq(episodes.id, episodeId), eq(podcasts.ownerId, user.userId)))
        .limit(1);
      if (!ownedEp.length) {
        return reply.status(403).send({ error: 'Episode not found or not yours' });
      }
    }

    await db.insert(podsignalOutputUsage).values({
      userId: user.userId,
      episodeId: episodeId ?? null,
      eventType: eventType as OutputUsageEventType,
      payload: payload ?? {},
    });

    request.log.info({ eventType, episodeId: episodeId ?? null }, '[podsignal] output-usage recorded');
    return reply.send({ ok: true });
  });

  // GET /api/podsignal/launch-evidence/:episodeId — canonical graph + compiler output (migration 0017)
  fastify.get<{
    Params: { episodeId: string };
    Querystring: { windowDays?: string };
  }>('/launch-evidence/:episodeId', async (request, reply) => {
    if (!(await ensurePodsignalPilotSchema(reply))) return;
    if (!(await ensureLaunchEvidenceGraphSchema(reply))) return;
    const user = request.user;
    if (!user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const episodeId = request.params.episodeId;
    if (!z.string().uuid().safeParse(episodeId).success) {
      return reply.status(400).send({ error: 'Invalid episodeId' });
    }

    const windowDaysRaw = request.query.windowDays;
    const windowDays =
      windowDaysRaw !== undefined && /^\d+$/.test(windowDaysRaw)
        ? Math.min(365, Math.max(1, parseInt(windowDaysRaw, 10)))
        : 30;

    try {
      const graph = await fetchLaunchEvidenceForEpisode(user.userId, episodeId, windowDays);
      if (!graph) {
        return reply.status(404).send({ error: 'Episode or campaign not found' });
      }

      return reply.send({
        graph: {
          episodeId: graph.episodeId,
          episodeTitle: graph.episodeTitle,
          podcastId: graph.podcastId,
          campaign: {
            id: graph.campaign.id,
            status: graph.campaign.status,
            utmCampaign: graph.campaign.utmCampaign,
            launchPackApproved: graph.campaign.launchPackApproved,
          },
          window: graph.window,
          counts: graph.counts,
          links: graph.links,
          scores: graph.scores,
        },
        launchProof: buildLaunchProofReport(graph),
        sponsorProof: buildSponsorProofSummary(graph),
      });
    } catch (e: unknown) {
      if (handlePodsignalPilotDbError(e, reply)) return;
      throw e;
    }
  });
}
