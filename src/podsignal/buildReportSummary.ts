/**
 * Builds the rolling-window sponsor / launch proof summary (JSON + PDF source).
 *
 * `evidenceScores` are derived from the same rolling window only — they do **not** require
 * migration 0017. The full per-episode Launch Evidence Graph (`GET /api/podsignal/launch-evidence`)
 * and first-class export lineage JSON columns require 0017 + 0018 — see docs/PODSIGNAL_SNAPSHOTS_AND_REPORTS.md.
 */

import { and, count, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  campaigns,
  campaignTasks,
  episodes,
  podcasts,
  podsignalHostMetricSnapshots,
  podsignalLinkClicks,
  podsignalOutputUsage,
  podsignalTrackableLinks,
} from '../db/schema.js';
import { scoreLaunchEvidence } from './evidenceScoring.js';
import {
  buildBeforeAfterNarrative,
  buildExecutiveNarrative,
  buildLikelyWorkedNarrative,
} from './pilotReport.js';
import type { PodsignalReportSummary } from './reportSummaryData.js';

export async function buildPodsignalReportSummary(
  userId: string,
  windowDays = 30,
): Promise<PodsignalReportSummary> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const usageRows = await db
    .select({
      eventType: podsignalOutputUsage.eventType,
      c: count(),
    })
    .from(podsignalOutputUsage)
    .where(and(eq(podsignalOutputUsage.userId, userId), gte(podsignalOutputUsage.createdAt, since)))
    .groupBy(podsignalOutputUsage.eventType);

  const outputUsageByType = Object.fromEntries(usageRows.map((r) => [r.eventType, Number(r.c)]));
  const outputUsageEventTotal = Object.values(outputUsageByType).reduce((a, b) => a + b, 0);

  const [launchPackApprovalsRow] = await db
    .select({ c: count() })
    .from(podsignalOutputUsage)
    .where(
      and(
        eq(podsignalOutputUsage.userId, userId),
        eq(podsignalOutputUsage.eventType, 'launch_pack_approved'),
        gte(podsignalOutputUsage.createdAt, since),
      ),
    );

  const [showCount] = await db
    .select({ c: count() })
    .from(podcasts)
    .where(eq(podcasts.ownerId, userId));

  const [activeCampaignsRow] = await db
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

  const [clickTotal] = await db
    .select({ c: count() })
    .from(podsignalLinkClicks)
    .innerJoin(podsignalTrackableLinks, eq(podsignalLinkClicks.linkId, podsignalTrackableLinks.id))
    .where(
      and(eq(podsignalTrackableLinks.ownerId, userId), gte(podsignalLinkClicks.clickedAt, since)),
    );

  const episodeClickRowsRaw = await db
    .select({
      episodeId: podsignalTrackableLinks.episodeId,
      clicks: sql<number>`count(${podsignalLinkClicks.id})::int`,
    })
    .from(podsignalLinkClicks)
    .innerJoin(podsignalTrackableLinks, eq(podsignalLinkClicks.linkId, podsignalTrackableLinks.id))
    .where(
      and(eq(podsignalTrackableLinks.ownerId, userId), gte(podsignalLinkClicks.clickedAt, since)),
    )
    .groupBy(podsignalTrackableLinks.episodeId);

  const episodeClickRows = [...episodeClickRowsRaw]
    .sort((a, b) => Number(b.clicks) - Number(a.clicks))
    .slice(0, 12);

  const linkRowsInWindow = await db
    .select({
      assetKind: podsignalTrackableLinks.assetKind,
      channel: podsignalTrackableLinks.channel,
    })
    .from(podsignalTrackableLinks)
    .where(
      and(eq(podsignalTrackableLinks.ownerId, userId), gte(podsignalTrackableLinks.createdAt, since)),
    );
  const trackableLinksCountInWindow = linkRowsInWindow.length;
  const distinctLinkChannelsWorkspace = new Set(
    linkRowsInWindow.map((r) => r.channel ?? r.assetKind),
  ).size;

  const [hostSnapWorkspace] = await db
    .select({ c: count() })
    .from(podsignalHostMetricSnapshots)
    .where(
      and(eq(podsignalHostMetricSnapshots.userId, userId), gte(podsignalHostMetricSnapshots.createdAt, since)),
    );

  const episodeIds = episodeClickRows.map((r) => r.episodeId);
  const titles: Record<string, string> = {};
  if (episodeIds.length) {
    const eps = await db
      .select({ id: episodes.id, title: episodes.title })
      .from(episodes)
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(and(eq(podcasts.ownerId, userId), inArray(episodes.id, episodeIds)));
    for (const e of eps) {
      titles[e.id] = e.title;
    }
  }

  const trackableLinkClicksObserved = Number(clickTotal?.c ?? 0);
  const launchPackApprovalsObserved = Number(launchPackApprovalsRow?.c ?? 0);
  const activeCampaignsApprox = Number(activeCampaignsRow?.c ?? 0);
  const launchTasksDone = Number(tasksDone?.c ?? 0);
  const launchTasksTotal = Number(tasksTotal?.c ?? 0);

  const beforeAfterNarrative = buildBeforeAfterNarrative({
    windowDays,
    trackableLinkClicksObserved,
    outputUsageEventTotal,
    launchPackApprovalsObserved,
    activeCampaignsApprox,
    launchTasksDone,
    launchTasksTotal,
  });

  const likelyWorkedNarrative = buildLikelyWorkedNarrative({
    windowDays,
    trackableLinkClicksObserved,
    outputUsageEventTotal,
    launchPackApprovalsObserved,
    activeCampaignsApprox,
    launchTasksDone,
    launchTasksTotal,
    outputUsageByType,
  });

  const narrative = buildExecutiveNarrative({
    windowDays,
    trackableLinkClicksObserved,
    outputUsageEventTotal,
    launchPackApprovalsObserved,
  });

  const evidenceScores = scoreLaunchEvidence({
    counts: {
      outputUsageByType,
      outputUsageEventTotal,
      trackableLinksCount: trackableLinksCountInWindow,
      redirectClicksInWindow: trackableLinkClicksObserved,
      checklistTasksDone: launchTasksDone,
      checklistTasksTotal: Math.max(launchTasksTotal, 1),
      distinctLinkChannels: distinctLinkChannelsWorkspace,
      reportExportsLogged: 0,
      performanceSnapshotCount: 0,
      hostMetricSnapshotCount: Number(hostSnapWorkspace?.c ?? 0),
    },
    campaign: {
      launchPackApproved: launchPackApprovalsObserved > 0,
    },
    window: { label: 'rolling' },
  });

  return {
    windowDays,
    generatedAt: new Date().toISOString(),
    outputUsageByType,
    outputUsageEventTotal,
    launchPackApprovalsObserved,
    trackableLinkClicksObserved,
    workspace: {
      shows: Number(showCount?.c ?? 0),
      activeCampaigns: activeCampaignsApprox,
      launchTasksDone,
      launchTasksTotal,
    },
    clicksByEpisode: episodeClickRows.map((r) => ({
      episodeId: r.episodeId,
      episodeTitle: titles[r.episodeId] ?? 'Episode',
      clicks: Number(r.clicks),
      evidence: 'observed' as const,
    })),
    narrative,
    beforeAfterNarrative,
    likelyWorkedNarrative,
    evidenceGuide: {
      observed: [
        'Short-link clicks (redirect hits logged by PodSignal)',
        'Output usage events (copies, exports, approvals, checklist completions)',
        'Launch pack approvals recorded in-app',
      ],
      proxy: [
        'Checklist completion rate across campaigns — directional signal for operational follow-through, not audience size',
      ],
      estimated: ['Future: modeled lift when baseline windows and platform exports exist'],
      unsupported: ['Spotify/Apple/YouTube native analytics without a tracked path into PodSignal'],
    },
    evidenceScores,
  };
}
