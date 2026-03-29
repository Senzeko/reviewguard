import { describe, it, expect } from 'vitest';
import {
  containsForbiddenCausalClaim,
  mapStrengthToGraphClass,
  scoreLaunchEvidence,
  scoreObservedActivation,
  classifyMetricEvidence,
} from './evidenceScoring.js';

describe('evidenceScoring', () => {
  it('maps inferred to estimated for graph class', () => {
    expect(mapStrengthToGraphClass('inferred')).toBe('estimated');
    expect(mapStrengthToGraphClass('observed')).toBe('observed');
  });

  it('flags forbidden causal claims', () => {
    expect(containsForbiddenCausalClaim('This caused a 10% lift')).toBe(true);
    expect(containsForbiddenCausalClaim('PodSignal observed 3 clicks')).toBe(false);
  });

  it('scoreObservedActivation is bounded 0–100', () => {
    const s = scoreObservedActivation({
      selectionEvents: 100,
      usageCopiesExports: 100,
      launchApprovals: 100,
      linksCreated: 100,
      redirectClicks: 10_000,
      checklistTasksDone: 100,
      reportExports: 100,
    });
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(100);
  });

  it('scoreLaunchEvidence produces three primitives', () => {
    const r = scoreLaunchEvidence({
      counts: {
        outputUsageByType: { launch_pack_approved: 1, trackable_link_created: 2 },
        outputUsageEventTotal: 5,
        trackableLinksCount: 2,
        redirectClicksInWindow: 4,
        checklistTasksDone: 2,
        checklistTasksTotal: 4,
        distinctLinkChannels: 2,
        reportExportsLogged: 0,
        performanceSnapshotCount: 0,
        hostMetricSnapshotCount: 1,
      },
      campaign: { launchPackApproved: true },
      window: { label: 'rolling' },
    });
    expect(r.observedActivation).toBeGreaterThanOrEqual(0);
    expect(r.launchExecution).toBeGreaterThanOrEqual(0);
    expect(r.sponsorProofStrength).toBeGreaterThanOrEqual(0);
    expect(r.breakdown.observedActivation).toBeDefined();
  });

  it('classifyMetricEvidence for clicks is observed', () => {
    const c = classifyMetricEvidence('redirect_clicks', 41);
    expect(c.evidenceClass).toBe('observed');
    expect(c.claimLanguage).toContain('41');
  });
});
