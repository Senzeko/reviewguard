/**
 * PodSignal Launch Evidence Graph — canonical object from episode + campaign + observed events.
 */

import { and, count, eq, gte, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  campaigns,
  campaignTasks,
  episodes,
  podcasts,
  podsignalAssetVariants,
  podsignalGuestTopicLinks,
  podsignalHostMetricSnapshots,
  podsignalLinkClicks,
  podsignalOutputUsage,
  podsignalPerformanceSnapshots,
  podsignalReportExports,
  podsignalTrackableLinks,
} from '../db/schema.js';
import { scoreLaunchEvidence, type LaunchEvidenceScoreInput } from './evidenceScoring.js';
import { outputUsageEventToFamily } from './eventTaxonomy.js';
import { launchPackSnapshotSchema } from './launchPack.js';

export interface LaunchWindowContext {
  windowStart: string;
  windowEnd: string;
  windowType: string;
  label: string;
}

export interface LaunchEvidenceGraph extends LaunchEvidenceScoreInput {
  episodeId: string;
  episodeTitle: string;
  podcastId: string;
  campaign: LaunchEvidenceScoreInput['campaign'] & {
    id: string;
    status: string;
    utmCampaign: string | null;
    launchPack: unknown;
  };
  window: LaunchEvidenceScoreInput['window'] & LaunchWindowContext;
  links: {
    id: string;
    assetKind: string;
    channel: string | null;
    clicksInWindow: number;
    evidence: 'observed';
  }[];
  scores: ReturnType<typeof scoreLaunchEvidence>;
}

function parseLaunchPackApproved(launchPack: unknown): boolean {
  const parsed = launchPackSnapshotSchema.safeParse(launchPack);
  if (!parsed.success) return false;
  if (parsed.data.status === 'approved') return true;
  return Boolean(parsed.data.approvedAt);
}

/** Default rolling window ending now (matches sponsor report unless overridden). */
export function getLaunchWindowContext(windowDays: number, end: Date = new Date()): LaunchWindowContext {
  const windowEnd = end;
  const windowStart = new Date(end.getTime() - windowDays * 24 * 60 * 60 * 1000);
  return {
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    windowType: 'rolling',
    label: 'rolling',
  };
}

export interface LaunchEvidenceGraphBuildInput extends LaunchEvidenceScoreInput {
  episodeId: string;
  episodeTitle: string;
  podcastId: string;
  campaign: LaunchEvidenceGraph['campaign'];
  window: LaunchEvidenceGraph['window'];
  links: LaunchEvidenceGraph['links'];
}

/** Assemble graph + scores from preloaded aggregates (pure). */
export function buildLaunchEvidenceGraph(input: LaunchEvidenceGraphBuildInput): LaunchEvidenceGraph {
  const { episodeId, episodeTitle, podcastId, campaign, window, links, counts } = input;
  const scores = scoreLaunchEvidence({ counts, campaign, window });
  return {
    episodeId,
    episodeTitle,
    podcastId,
    campaign,
    window,
    links,
    counts,
    scores,
  };
}

export function getObservedLinkSummary(links: LaunchEvidenceGraph['links']): {
  totalClicks: number;
  byAssetKind: Record<string, number>;
} {
  const byAssetKind: Record<string, number> = {};
  let totalClicks = 0;
  for (const l of links) {
    totalClicks += l.clicksInWindow;
    byAssetKind[l.assetKind] = (byAssetKind[l.assetKind] ?? 0) + l.clicksInWindow;
  }
  return { totalClicks, byAssetKind };
}

export function getObservedUsageSummary(outputUsageByType: Record<string, number>): {
  total: number;
  byFamilyApprox: { workflow: number; usage: number; link: number; selection: number; other: number };
} {
  const byFamilyApprox = { workflow: 0, usage: 0, link: 0, selection: 0, other: 0 };
  let total = 0;
  for (const [k, v] of Object.entries(outputUsageByType)) {
    total += v;
    const fam = outputUsageEventToFamily(k);
    if (fam === 'workflow') byFamilyApprox.workflow += v;
    else if (fam === 'usage') byFamilyApprox.usage += v;
    else if (fam === 'link') byFamilyApprox.link += v;
    else if (fam === 'selection') byFamilyApprox.selection += v;
    else byFamilyApprox.other += v;
  }
  return { total, byFamilyApprox };
}

/**
 * Load graph for one episode (owner-scoped). Requires DB migration 0017 for full counts
 * (asset variants, performance snapshots, guest links, report_exports).
 */
export async function fetchLaunchEvidenceForEpisode(
  ownerId: string,
  episodeId: string,
  windowDays = 30,
): Promise<LaunchEvidenceGraph | null> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const windowCtx = getLaunchWindowContext(windowDays);

  const epRows = await db
    .select({
      id: episodes.id,
      title: episodes.title,
      podcastId: episodes.podcastId,
    })
    .from(episodes)
    .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
    .where(and(eq(episodes.id, episodeId), eq(podcasts.ownerId, ownerId)))
    .limit(1);
  if (!epRows.length) return null;

  const ep = epRows[0]!;

  const [camp] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.episodeId, episodeId))
    .limit(1);
  if (!camp) return null;

  const taskRows = await db
    .select({ id: campaignTasks.id, doneAt: campaignTasks.doneAt })
    .from(campaignTasks)
    .where(eq(campaignTasks.campaignId, camp.id));

  const checklistTasksTotal = taskRows.length;
  const checklistTasksDone = taskRows.filter((t) => t.doneAt != null).length;

  const usageRows = await db
    .select({
      eventType: podsignalOutputUsage.eventType,
      c: count(),
    })
    .from(podsignalOutputUsage)
    .where(
      and(
        eq(podsignalOutputUsage.userId, ownerId),
        eq(podsignalOutputUsage.episodeId, episodeId),
        gte(podsignalOutputUsage.createdAt, since),
      ),
    )
    .groupBy(podsignalOutputUsage.eventType);

  const outputUsageByType = Object.fromEntries(usageRows.map((r) => [r.eventType, Number(r.c)]));
  const outputUsageEventTotal = Object.values(outputUsageByType).reduce((a, b) => a + b, 0);

  const linkRows = await db
    .select()
    .from(podsignalTrackableLinks)
    .where(
      and(eq(podsignalTrackableLinks.episodeId, episodeId), eq(podsignalTrackableLinks.ownerId, ownerId)),
    );

  const linkIds = linkRows.map((r) => r.id);
  const clicksByLink = new Map<string, number>();
  if (linkIds.length) {
    const clickAgg = await db
      .select({
        linkId: podsignalLinkClicks.linkId,
        c: count(),
      })
      .from(podsignalLinkClicks)
      .where(
        and(inArray(podsignalLinkClicks.linkId, linkIds), gte(podsignalLinkClicks.clickedAt, since)),
      )
      .groupBy(podsignalLinkClicks.linkId);
    for (const r of clickAgg) {
      clicksByLink.set(r.linkId, Number(r.c));
    }
  }

  const links: LaunchEvidenceGraph['links'] = linkRows.map((row) => ({
    id: row.id,
    assetKind: row.assetKind,
    channel: row.channel,
    clicksInWindow: clicksByLink.get(row.id) ?? 0,
    evidence: 'observed' as const,
  }));

  const redirectClicksInWindow = links.reduce((s, l) => s + l.clicksInWindow, 0);
  const channels = new Set<string>();
  for (const l of linkRows) {
    channels.add(l.channel ?? l.assetKind);
  }
  const distinctLinkChannels = channels.size;

  const [hostSnap] = await db
    .select({ c: count() })
    .from(podsignalHostMetricSnapshots)
    .where(
      and(
        eq(podsignalHostMetricSnapshots.userId, ownerId),
        eq(podsignalHostMetricSnapshots.episodeId, episodeId),
        gte(podsignalHostMetricSnapshots.createdAt, since),
      ),
    );

  const [assetVarCount] = await db
    .select({ c: count() })
    .from(podsignalAssetVariants)
    .where(
      and(eq(podsignalAssetVariants.ownerId, ownerId), eq(podsignalAssetVariants.episodeId, episodeId)),
    );

  const [perfCount] = await db
    .select({ c: count() })
    .from(podsignalPerformanceSnapshots)
    .where(
      and(
        eq(podsignalPerformanceSnapshots.ownerId, ownerId),
        eq(podsignalPerformanceSnapshots.episodeId, episodeId),
        gte(podsignalPerformanceSnapshots.capturedAt, since),
      ),
    );

  const [guestCount] = await db
    .select({ c: count() })
    .from(podsignalGuestTopicLinks)
    .where(eq(podsignalGuestTopicLinks.episodeId, episodeId));

  const [exportCount] = await db
    .select({ c: count() })
    .from(podsignalReportExports)
    .where(
      and(eq(podsignalReportExports.ownerId, ownerId), eq(podsignalReportExports.episodeId, episodeId)),
    );

  const launchPackApproved = parseLaunchPackApproved(camp.launchPack);

  return buildLaunchEvidenceGraph({
    episodeId: ep.id,
    episodeTitle: ep.title,
    podcastId: ep.podcastId,
    campaign: {
      id: camp.id,
      status: camp.status,
      utmCampaign: camp.utmCampaign,
      launchPack: camp.launchPack,
      launchPackApproved,
    },
    window: {
      ...windowCtx,
      label: windowCtx.label,
    },
    links,
    counts: {
      outputUsageByType,
      outputUsageEventTotal,
      trackableLinksCount: linkRows.length,
      redirectClicksInWindow,
      checklistTasksDone,
      checklistTasksTotal,
      distinctLinkChannels,
      reportExportsLogged: Number(exportCount?.c ?? 0),
      performanceSnapshotCount: Number(perfCount?.c ?? 0),
      hostMetricSnapshotCount: Number(hostSnap?.c ?? 0),
      assetVariantCount: Number(assetVarCount?.c ?? 0),
      guestTopicLinkCount: Number(guestCount?.c ?? 0),
    },
  });
}
