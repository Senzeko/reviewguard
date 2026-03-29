/**
 * Evidence scoring for the Launch Evidence Graph — deterministic, explainable bands.
 * Graph uses four classes (spec); measurement.ts uses "inferred" — mapped to "estimated" here.
 */

import type { EvidenceStrength } from './measurement.js';
import { containsForbiddenCausalClaim, FORBIDDEN_CAUSAL_CLAIMS } from './measurement.js';

export type GraphEvidenceClass = 'observed' | 'proxy' | 'estimated' | 'unsupported';

export type ConfidenceBand = 'high' | 'medium' | 'low';

export interface MetricEvidenceClassification {
  metricId: string;
  evidenceClass: GraphEvidenceClass;
  confidence: ConfidenceBand;
  claimLanguage: string;
  supportingObservations: string[];
  forbiddenClaims: string[];
}

export function mapStrengthToGraphClass(strength: EvidenceStrength): GraphEvidenceClass {
  if (strength === 'inferred') return 'estimated';
  return strength;
}

export interface ScoringPrimitives {
  /** 0–100: selections, copies, exports, links, clicks, tasks, exports */
  observedActivation: number;
  /** 0–100: checklist completion, pack approval, link coverage */
  launchExecution: number;
  /** 0–100: share of observed vs proxy in what would surface in a sponsor report */
  sponsorProofStrength: number;
  breakdown: {
    observedActivation: Record<string, number>;
    launchExecution: Record<string, number>;
    sponsorProofStrength: Record<string, number>;
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Weighted Observed Activation Score from discrete signals (all observed tier).
 */
export function scoreObservedActivation(input: {
  selectionEvents: number;
  usageCopiesExports: number;
  launchApprovals: number;
  linksCreated: number;
  redirectClicks: number;
  checklistTasksDone: number;
  reportExports: number;
}): { score: number; parts: Record<string, number> } {
  const w = {
    selection: 8,
    usage: 10,
    approval: 14,
    links: 12,
    clicks: 18,
    tasks: 12,
    exports: 10,
  };
  const cap = 100;
  const raw =
    Math.min(input.selectionEvents, 20) * w.selection * 0.05 +
    Math.min(input.usageCopiesExports, 40) * w.usage * 0.025 +
    Math.min(input.launchApprovals, 10) * w.approval * 0.1 +
    Math.min(input.linksCreated, 15) * w.links * (1 / 15) +
    Math.min(input.redirectClicks, 500) * w.clicks * (1 / 500) +
    Math.min(input.checklistTasksDone, 30) * w.tasks * (1 / 30) +
    Math.min(input.reportExports, 20) * w.exports * 0.05;
  const score = clamp(Math.round(raw), 0, cap);
  return {
    score,
    parts: {
      selectionEvents: input.selectionEvents,
      usageCopiesExports: input.usageCopiesExports,
      launchApprovals: input.launchApprovals,
      linksCreated: input.linksCreated,
      redirectClicks: input.redirectClicks,
      checklistTasksDone: input.checklistTasksDone,
      reportExports: input.reportExports,
    },
  };
}

export function scoreLaunchExecution(input: {
  tasksDone: number;
  tasksTotal: number;
  launchPackApproved: boolean;
  distinctLinkChannels: number;
}): { score: number; parts: Record<string, number> } {
  const taskRatio = input.tasksTotal > 0 ? input.tasksDone / input.tasksTotal : 0;
  const taskPart = taskRatio * 45;
  const packPart = input.launchPackApproved ? 35 : 0;
  const linkPart = clamp(input.distinctLinkChannels * 10, 0, 20);
  const score = clamp(Math.round(taskPart + packPart + linkPart), 0, 100);
  return {
    score,
    parts: {
      taskCompletionRatio: Math.round(taskRatio * 1000) / 1000,
      launchPackApproved: input.launchPackApproved ? 1 : 0,
      distinctLinkChannels: input.distinctLinkChannels,
    },
  };
}

export function scoreSponsorProofStrength(input: {
  observedClickCount: number;
  observedUsageEventCount: number;
  proxySnapshotCount: number;
  hasLaunchWindow: boolean;
}): { score: number; parts: Record<string, number> } {
  const clickPart = clamp(Math.log10(1 + input.observedClickCount) * 22, 0, 40);
  const usagePart = clamp(Math.log10(1 + input.observedUsageEventCount) * 18, 0, 35);
  const proxyPenalty = clamp(input.proxySnapshotCount * 3, 0, 25);
  const windowBonus = input.hasLaunchWindow ? 10 : 0;
  const score = clamp(Math.round(clickPart + usagePart + windowBonus - proxyPenalty * 0.5), 0, 100);
  return {
    score,
    parts: {
      observedClickCount: input.observedClickCount,
      observedUsageEventCount: input.observedUsageEventCount,
      proxySnapshotCount: input.proxySnapshotCount,
      hasLaunchWindow: input.hasLaunchWindow ? 1 : 0,
    },
  };
}

/** Shape needed for scoring — same as LaunchEvidenceGraph fields used by scores. */
export interface LaunchEvidenceScoreInput {
  counts: {
    outputUsageByType: Record<string, number>;
    outputUsageEventTotal: number;
    trackableLinksCount: number;
    redirectClicksInWindow: number;
    checklistTasksDone: number;
    checklistTasksTotal: number;
    distinctLinkChannels: number;
    reportExportsLogged: number;
    performanceSnapshotCount: number;
    hostMetricSnapshotCount: number;
    /** First-class asset rows (migration 0017); optional for scoring v1 */
    assetVariantCount?: number;
    guestTopicLinkCount?: number;
  };
  campaign: { launchPackApproved: boolean };
  window: { label: string };
}

export function scoreLaunchEvidence(graph: LaunchEvidenceScoreInput): ScoringPrimitives {
  const selectionEvents =
    (graph.counts.outputUsageByType['title_option_selected'] ?? 0) +
    (graph.counts.outputUsageByType['clip_candidate_approved'] ?? 0);

  const usageCopiesExports =
    (graph.counts.outputUsageByType['guest_share_copied'] ?? 0) +
    (graph.counts.outputUsageByType['guest_share_exported'] ?? 0) +
    (graph.counts.outputUsageByType['newsletter_copy_copied'] ?? 0) +
    (graph.counts.outputUsageByType['social_variant_copied'] ?? 0) +
    (graph.counts.outputUsageByType['launch_asset_copied'] ?? 0) +
    (graph.counts.outputUsageByType['sponsor_report_exported'] ?? 0) +
    (graph.counts.outputUsageByType['sponsor_one_pager_exported'] ?? 0);

  const launchApprovals = graph.counts.outputUsageByType['launch_pack_approved'] ?? 0;
  const linksCreated = graph.counts.trackableLinksCount;
  const redirectClicks = graph.counts.redirectClicksInWindow;
  const checklistTasksDone = graph.counts.checklistTasksDone;
  const reportExports =
    graph.counts.reportExportsLogged +
    (graph.counts.outputUsageByType['sponsor_report_exported'] ?? 0) +
    (graph.counts.outputUsageByType['sponsor_one_pager_exported'] ?? 0);

  const oa = scoreObservedActivation({
    selectionEvents,
    usageCopiesExports,
    launchApprovals,
    linksCreated,
    redirectClicks,
    checklistTasksDone,
    reportExports,
  });

  const tasksTotal = Math.max(graph.counts.checklistTasksTotal, 1);
  const le = scoreLaunchExecution({
    tasksDone: graph.counts.checklistTasksDone,
    tasksTotal,
    launchPackApproved: graph.campaign.launchPackApproved,
    distinctLinkChannels: graph.counts.distinctLinkChannels,
  });

  const sp = scoreSponsorProofStrength({
    observedClickCount: redirectClicks,
    observedUsageEventCount: graph.counts.outputUsageEventTotal,
    proxySnapshotCount:
      graph.counts.performanceSnapshotCount + graph.counts.hostMetricSnapshotCount,
    hasLaunchWindow: graph.window.label !== 'rolling',
  });

  return {
    observedActivation: oa.score,
    launchExecution: le.score,
    sponsorProofStrength: sp.score,
    breakdown: {
      observedActivation: oa.parts,
      launchExecution: le.parts,
      sponsorProofStrength: sp.parts,
    },
  };
}

/** Classify redirect click totals for sponsor-safe copy. */
export function classifyMetricEvidence(metricId: 'redirect_clicks', value: number): MetricEvidenceClassification {
  return {
    metricId,
    evidenceClass: 'observed',
    confidence: value >= 10 ? 'high' : value > 0 ? 'medium' : 'low',
    claimLanguage: `PodSignal observed ${value} redirect click${value === 1 ? '' : 's'} on trackable links in this window.`,
    supportingObservations: ['redirect_click_logged', 'trackable_link_created'],
    forbiddenClaims: [
      'Do not claim these clicks equal unique listeners.',
      'Do not claim platform attribution without integrated source.',
    ],
  };
}

export function getClaimLanguage(
  evidenceClass: GraphEvidenceClass,
  kind: 'clicks' | 'tasks' | 'snapshots',
): string {
  if (kind === 'clicks' && evidenceClass === 'observed') {
    return 'PodSignal-observed redirect events on short links you created here.';
  }
  if (kind === 'tasks' && evidenceClass === 'proxy') {
    return 'Checklist completion is a directional signal of launch execution, not audience reach.';
  }
  if (kind === 'snapshots' && evidenceClass === 'proxy') {
    return 'Self-reported or imported platform metrics are proxy evidence — not observed by PodSignal.';
  }
  if (evidenceClass === 'estimated') {
    return 'Pattern-based language only: likely associated with, not causal.';
  }
  if (evidenceClass === 'unsupported') {
    return 'Not measured in PodSignal with current integrations.';
  }
  return 'See evidence guide for this metric.';
}

export { containsForbiddenCausalClaim, FORBIDDEN_CAUSAL_CLAIMS };
