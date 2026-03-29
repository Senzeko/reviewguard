/**
 * Contract for GET /api/podsignal/launch-evidence/:episodeId — shape only (no HTTP).
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const launchEvidenceResponseSchema = z.object({
  graph: z.object({
    episodeId: z.string().uuid(),
    episodeTitle: z.string(),
    podcastId: z.string().uuid(),
    campaign: z.object({
      id: z.string().uuid(),
      status: z.string(),
      utmCampaign: z.string().nullable(),
      launchPackApproved: z.boolean(),
    }),
    window: z.object({
      windowStart: z.string(),
      windowEnd: z.string(),
      windowType: z.string(),
      label: z.string(),
    }),
    counts: z.record(z.string(), z.unknown()),
    links: z.array(
      z.object({
        id: z.string().uuid(),
        assetKind: z.string(),
        channel: z.string().nullable(),
        clicksInWindow: z.number(),
        evidence: z.literal('observed'),
      }),
    ),
    scores: z.object({
      observedActivation: z.number(),
      launchExecution: z.number(),
      sponsorProofStrength: z.number(),
      breakdown: z.object({
        observedActivation: z.record(z.string(), z.number()),
        launchExecution: z.record(z.string(), z.number()),
        sponsorProofStrength: z.record(z.string(), z.number()),
      }),
    }),
  }),
  launchProof: z.object({
    headline: z.string(),
    sections: z.array(z.unknown()),
    scoresSummary: z.string(),
    disclaimer: z.string(),
  }),
  sponsorProof: z.object({
    executiveLine: z.string(),
    observedLine: z.string(),
    proxyLine: z.string(),
    evidenceClassesUsed: z.array(z.string()),
  }),
});

describe('launch-evidence response contract', () => {
  it('accepts a minimal valid payload', () => {
    const sample = {
      graph: {
        episodeId: '00000000-0000-4000-8000-000000000001',
        episodeTitle: 'Ep',
        podcastId: '00000000-0000-4000-8000-000000000002',
        campaign: {
          id: '00000000-0000-4000-8000-000000000003',
          status: 'ACTIVE',
          utmCampaign: null,
          launchPackApproved: false,
        },
        window: {
          windowStart: '2026-01-01T00:00:00.000Z',
          windowEnd: '2026-01-31T00:00:00.000Z',
          windowType: 'rolling',
          label: 'rolling',
        },
        counts: { a: 1 },
        links: [],
        scores: {
          observedActivation: 0,
          launchExecution: 0,
          sponsorProofStrength: 0,
          breakdown: {
            observedActivation: {},
            launchExecution: {},
            sponsorProofStrength: {},
          },
        },
      },
      launchProof: {
        headline: 'H',
        sections: [],
        scoresSummary: 'S',
        disclaimer: 'D',
      },
      sponsorProof: {
        executiveLine: 'E',
        observedLine: 'O',
        proxyLine: 'P',
        evidenceClassesUsed: ['observed'],
      },
    };
    expect(() => launchEvidenceResponseSchema.parse(sample)).not.toThrow();
  });
});
