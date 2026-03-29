import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/** Contract for GET /api/podsignal/report-summary — catches accidental field drops. */
export const podsignalReportSummarySchema = z.object({
  windowDays: z.number(),
  generatedAt: z.string(),
  outputUsageByType: z.record(z.string(), z.number()),
  outputUsageEventTotal: z.number(),
  launchPackApprovalsObserved: z.number(),
  trackableLinkClicksObserved: z.number(),
  workspace: z.object({
    shows: z.number(),
    activeCampaigns: z.number(),
    launchTasksDone: z.number(),
    launchTasksTotal: z.number(),
  }),
  clicksByEpisode: z.array(
    z.object({
      episodeId: z.string(),
      episodeTitle: z.string(),
      clicks: z.number(),
      evidence: z.literal('observed'),
    }),
  ),
  narrative: z.object({ headline: z.string(), body: z.string() }),
  beforeAfterNarrative: z.string(),
  likelyWorkedNarrative: z.string(),
  evidenceGuide: z.object({
    observed: z.array(z.string()),
    proxy: z.array(z.string()),
    estimated: z.array(z.string()),
    unsupported: z.array(z.string()),
  }),
  evidenceScores: z.object({
    observedActivation: z.number(),
    launchExecution: z.number(),
    sponsorProofStrength: z.number(),
    breakdown: z.object({
      observedActivation: z.record(z.string(), z.number()),
      launchExecution: z.record(z.string(), z.number()),
      sponsorProofStrength: z.record(z.string(), z.number()),
    }),
  }),
});

describe('report summary contract', () => {
  it('accepts a minimal valid payload', () => {
    const sample = {
      windowDays: 30,
      generatedAt: new Date().toISOString(),
      outputUsageByType: { title_option_selected: 2 },
      outputUsageEventTotal: 2,
      launchPackApprovalsObserved: 1,
      trackableLinkClicksObserved: 5,
      workspace: { shows: 1, activeCampaigns: 0, launchTasksDone: 1, launchTasksTotal: 4 },
      clicksByEpisode: [
        { episodeId: '00000000-0000-4000-8000-000000000001', episodeTitle: 'Ep 1', clicks: 3, evidence: 'observed' as const },
      ],
      narrative: { headline: 'H', body: 'B' },
      beforeAfterNarrative: 'x',
      likelyWorkedNarrative: 'y',
      evidenceGuide: {
        observed: ['a'],
        proxy: ['b'],
        estimated: ['c'],
        unsupported: ['d'],
      },
      evidenceScores: {
        observedActivation: 10,
        launchExecution: 20,
        sponsorProofStrength: 30,
        breakdown: {
          observedActivation: {},
          launchExecution: {},
          sponsorProofStrength: {},
        },
      },
    };
    expect(() => podsignalReportSummarySchema.parse(sample)).not.toThrow();
  });
});
