/**
 * Sponsor / launch proof compiler — structured sections from graph + scores (no LLM).
 */

import type { LaunchEvidenceGraph } from './launchEvidenceGraph.js';
import { getObservedLinkSummary, getObservedUsageSummary } from './launchEvidenceGraph.js';
import { getClaimLanguage, type GraphEvidenceClass } from './evidenceScoring.js';

export interface LaunchProofSection {
  id: string;
  title: string;
  evidenceClass: GraphEvidenceClass;
  body: string;
  bullets?: string[];
}

export interface LaunchProofReport {
  headline: string;
  sections: LaunchProofSection[];
  scoresSummary: string;
  disclaimer: string;
}

export function buildLaunchProofReport(graph: LaunchEvidenceGraph): LaunchProofReport {
  const linkSum = getObservedLinkSummary(graph.links);
  const usageSum = getObservedUsageSummary(graph.counts.outputUsageByType);

  const scoresSummary = `Observed activation ${graph.scores.observedActivation}/100 · Launch execution ${graph.scores.launchExecution}/100 · Sponsor-proof strength ${graph.scores.sponsorProofStrength}/100 (deterministic weights; not predictive).`;

  const sections: LaunchProofSection[] = [
    {
      id: 'observed_clicks',
      title: 'Observed link activity',
      evidenceClass: 'observed',
      body: getClaimLanguage('observed', 'clicks'),
      bullets: [
        `${linkSum.totalClicks} redirect click(s) in the selected window on PodSignal trackable links.`,
        ...Object.entries(linkSum.byAssetKind).map(([k, v]) => `${k}: ${v}`),
      ],
    },
    {
      id: 'workflow_usage',
      title: 'In-app workflow & usage signals',
      evidenceClass: 'observed',
      body: `${usageSum.total} output-usage events recorded for this episode in-window (copies, approvals, checklist, etc.).`,
      bullets: [
        `Workflow-ish: ${usageSum.byFamilyApprox.workflow}`,
        `Copy/export usage: ${usageSum.byFamilyApprox.usage}`,
        `Selection events: ${usageSum.byFamilyApprox.selection}`,
      ],
    },
    {
      id: 'execution',
      title: 'Launch execution (proxy aspects)',
      evidenceClass: 'proxy',
      body: getClaimLanguage('proxy', 'tasks'),
      bullets: [
        `Checklist: ${graph.counts.checklistTasksDone} / ${graph.counts.checklistTasksTotal} tasks marked done.`,
        `Launch pack approved in-app: ${graph.campaign.launchPackApproved ? 'yes' : 'no'}.`,
      ],
    },
    {
      id: 'proxy_metrics',
      title: 'Platform / manual snapshots',
      evidenceClass: 'proxy',
      body: getClaimLanguage('proxy', 'snapshots'),
      bullets: [
        `Legacy host metric rows (window): ${graph.counts.hostMetricSnapshotCount}`,
        `Performance snapshots table (0017): ${graph.counts.performanceSnapshotCount}`,
      ],
    },
    {
      id: 'lineage',
      title: 'Asset lineage (foundation)',
      evidenceClass: 'observed',
      body: 'First-class asset variant rows and guest/topic links extend the graph as they are populated.',
      bullets: [
        `Asset variants stored: ${graph.counts.assetVariantCount ?? 0}`,
        `Guest/topic links: ${graph.counts.guestTopicLinkCount ?? 0}`,
        `Structured report exports logged: ${graph.counts.reportExportsLogged}`,
      ],
    },
  ];

  return {
    headline: `Launch evidence — ${graph.episodeTitle}`,
    sections,
    scoresSummary,
    disclaimer:
      'Directional and observed signals only. PodSignal does not claim causal listener lift from these metrics.',
  };
}

export interface SponsorProofSummary {
  executiveLine: string;
  observedLine: string;
  proxyLine: string;
  evidenceClassesUsed: GraphEvidenceClass[];
}

export function buildSponsorProofSummary(graph: LaunchEvidenceGraph): SponsorProofSummary {
  const linkSum = getObservedLinkSummary(graph.links);
  return {
    executiveLine: `${graph.episodeTitle}: sponsor-proof strength score ${graph.scores.sponsorProofStrength}/100 (internal composite; see report for evidence mix).`,
    observedLine: `PodSignal observed ${linkSum.totalClicks} short-link redirect(s) and ${graph.counts.outputUsageEventTotal} in-product usage events in the window.`,
    proxyLine: `${graph.counts.performanceSnapshotCount + graph.counts.hostMetricSnapshotCount} self-reported / imported snapshot row(s) — proxy tier, not observed redirects.`,
    evidenceClassesUsed: ['observed', 'proxy'],
  };
}
