import { describe, it, expect } from 'vitest';
import {
  buildBeforeAfterNarrative,
  buildExecutiveNarrative,
  buildLikelyWorkedNarrative,
} from './pilotReport.js';

describe('buildExecutiveNarrative', () => {
  it('uses factual counts when any activity exists', () => {
    const { headline, body } = buildExecutiveNarrative({
      windowDays: 30,
      trackableLinkClicksObserved: 5,
      outputUsageEventTotal: 12,
      launchPackApprovalsObserved: 1,
    });
    expect(headline).toContain('observed');
    expect(body).toContain('5');
    expect(body).toContain('12');
    expect(body).toContain('1');
    expect(body.toLowerCase()).toMatch(/not .*spotify|spotify.*not/);
    expect(body).toMatch(/PodSignal/);
  });

  it('uses empty-state headline when all counts are zero', () => {
    const { headline, body } = buildExecutiveNarrative({
      windowDays: 7,
      trackableLinkClicksObserved: 0,
      outputUsageEventTotal: 0,
      launchPackApprovalsObserved: 0,
    });
    expect(headline.toLowerCase()).toContain('ready');
    expect(body).toContain('7');
  });
});

describe('buildBeforeAfterNarrative', () => {
  it('includes observed click count and avoids fake precision', () => {
    const s = buildBeforeAfterNarrative({
      windowDays: 30,
      trackableLinkClicksObserved: 12,
      outputUsageEventTotal: 40,
      launchPackApprovalsObserved: 2,
      activeCampaignsApprox: 1,
      launchTasksDone: 3,
      launchTasksTotal: 8,
    });
    expect(s).toContain('12');
    expect(s).toContain('PodSignal-observed');
    expect(s).toContain('38%'); // 3/8 rounded
    expect(s).toContain('ACTIVE');
    expect(s.toLowerCase()).not.toContain('caused');
  });

  it('buildLikelyWorked mentions clicks when observed', () => {
    const s = buildLikelyWorkedNarrative({
      windowDays: 30,
      trackableLinkClicksObserved: 3,
      outputUsageEventTotal: 10,
      launchPackApprovalsObserved: 1,
      activeCampaignsApprox: 1,
      launchTasksDone: 2,
      launchTasksTotal: 4,
      outputUsageByType: { guest_share_copied: 2, campaign_checklist_task_done: 1 },
    });
    expect(s).toContain('3');
    expect(s.toLowerCase()).not.toContain('caused');
  });

  it('handles zero tasks total without NaN', () => {
    const s = buildBeforeAfterNarrative({
      windowDays: 7,
      trackableLinkClicksObserved: 0,
      outputUsageEventTotal: 0,
      launchPackApprovalsObserved: 0,
      activeCampaignsApprox: 0,
      launchTasksDone: 0,
      launchTasksTotal: 0,
    });
    expect(s.includes('NaN')).toBe(false);
  });
});
