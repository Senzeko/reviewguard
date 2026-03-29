import { describe, it, expect } from 'vitest';
import {
  buildLaunchEvidenceGraph,
  getLaunchWindowContext,
  getObservedLinkSummary,
  getObservedUsageSummary,
} from './launchEvidenceGraph.js';

describe('launchEvidenceGraph', () => {
  it('getLaunchWindowContext returns rolling label', () => {
    const end = new Date('2026-01-15T12:00:00.000Z');
    const w = getLaunchWindowContext(7, end);
    expect(w.windowType).toBe('rolling');
    expect(w.label).toBe('rolling');
    expect(new Date(w.windowEnd).getTime()).toBe(end.getTime());
  });

  it('buildLaunchEvidenceGraph attaches scores', () => {
    const graph = buildLaunchEvidenceGraph({
      episodeId: 'e1',
      episodeTitle: 'Test',
      podcastId: 'p1',
      campaign: {
        id: 'c1',
        status: 'ACTIVE',
        utmCampaign: null,
        launchPack: {},
        launchPackApproved: true,
      },
      window: {
        ...getLaunchWindowContext(30),
        label: 'rolling',
      },
      links: [
        {
          id: 'l1',
          assetKind: 'guest_share',
          channel: 'email',
          clicksInWindow: 3,
          evidence: 'observed',
        },
      ],
      counts: {
        outputUsageByType: {},
        outputUsageEventTotal: 0,
        trackableLinksCount: 1,
        redirectClicksInWindow: 3,
        checklistTasksDone: 1,
        checklistTasksTotal: 2,
        distinctLinkChannels: 1,
        reportExportsLogged: 0,
        performanceSnapshotCount: 0,
        hostMetricSnapshotCount: 0,
      },
    });
    expect(graph.scores.sponsorProofStrength).toBeGreaterThanOrEqual(0);
    expect(graph.scores.observedActivation).toBeGreaterThanOrEqual(0);
  });

  it('getObservedLinkSummary aggregates by asset kind', () => {
    const s = getObservedLinkSummary([
      { id: '1', assetKind: 'social', channel: 'x', clicksInWindow: 2, evidence: 'observed' },
      { id: '2', assetKind: 'social', channel: 'linkedin', clicksInWindow: 1, evidence: 'observed' },
    ]);
    expect(s.totalClicks).toBe(3);
    expect(s.byAssetKind.social).toBe(3);
  });

  it('getObservedUsageSummary buckets families', () => {
    const s = getObservedUsageSummary({
      launch_pack_approved: 1,
      guest_share_copied: 2,
      title_option_selected: 1,
    });
    expect(s.total).toBe(4);
    expect(s.byFamilyApprox.workflow).toBeGreaterThanOrEqual(1);
    expect(s.byFamilyApprox.usage).toBeGreaterThanOrEqual(2);
  });
});
