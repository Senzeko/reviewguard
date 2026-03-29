/**
 * Pilot launch loop — mocked API + vite preview (no Postgres).
 * Approve pack → create trackable link → hit /r/:token → refresh report → clicks KPI updates.
 */

import { test, expect } from '@playwright/test';

const MOCK_USER = {
  userId: 'e2e-pilot-user',
  email: 'pilot@e2e.local',
  fullName: 'Pilot E2E',
  merchantId: 'e2e-merchant',
  merchant: {
    id: 'e2e-merchant',
    businessName: 'Pilot Co',
    posProvider: 'SQUARE',
    isActive: true,
    lastSyncAt: null as string | null,
  },
};

const EPISODE_ID = 'e2e-pilot-ep';
const PODCAST_ID = 'e2e-pilot-pod';
const LINK_TOKEN = 'e2etoken';

function reportSummaryPayload(trackableClicks: number) {
  return {
    windowDays: 30,
    generatedAt: new Date().toISOString(),
    outputUsageByType: {} as Record<string, number>,
    outputUsageEventTotal: 0,
    launchPackApprovalsObserved: 1,
    trackableLinkClicksObserved: trackableClicks,
    workspace: { shows: 1, activeCampaigns: 1, launchTasksDone: 0, launchTasksTotal: 0 },
    clicksByEpisode: [] as { episodeId: string; episodeTitle: string; clicks: number; evidence: 'observed' }[],
    narrative: { headline: 'Pilot workspace', body: 'Observed metrics only in this export.' },
    beforeAfterNarrative: 'In the reporting window, PodSignal recorded activity in your workspace.',
    likelyWorkedNarrative:
      'When checklist tasks and copy actions appear together with link clicks, treat that as a directional pattern — not proof of causality.',
    evidenceGuide: {
      observed: ['Trackable short-link redirects', 'In-app usage events'],
      proxy: ['Checklist completion counts'],
      estimated: [],
      unsupported: ['Host-platform listener totals'],
    },
    evidenceScores: {
      observedActivation: 12,
      launchExecution: 34,
      sponsorProofStrength: 56,
      breakdown: {
        observedActivation: {},
        launchExecution: {},
        sponsorProofStrength: {},
      },
    },
  };
}

async function mockAuth(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_USER),
    });
  });
}

test.describe('Pilot launch loop (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
    await page.route('**/api/sse/events', (route) => route.abort());
    await page.route('**/api/podsignal/output-usage', (route) => {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });
  });

  test('approve pack, trackable link, /r visit, refresh report updates clicks', async ({ page, baseURL }) => {
    const origin = baseURL ?? 'http://127.0.0.1:4173';

    const episodeBody = {
      id: EPISODE_ID,
      podcastId: PODCAST_ID,
      title: 'Pilot E2E Episode',
      description: null,
      audioUrl: null,
      durationSeconds: null,
      episodeNumber: null,
      seasonNumber: null,
      transcript: null,
      summary: null,
      chapters: [],
      status: 'READY',
      publishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      signals: [],
      clips: [],
      transcriptSegments: [],
    };

    let campaign = {
      id: 'e2e-campaign',
      episodeId: EPISODE_ID,
      status: 'DRAFT' as const,
      utmCampaign: null as string | null,
      launchPack: {
        status: 'draft' as const,
        selectedTitleIndex: 0,
        selectedTitleVariant: episodeBody.title,
      },
      startedAt: null as string | null,
      completedAt: null as string | null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tasks: [] as unknown[],
    };

    const links: Array<{
      id: string;
      token: string;
      episodeId: string;
      campaignId: string;
      assetKind: string;
      channel: string | null;
      targetUrl: string;
      clicksObserved: number;
      evidence: 'observed';
      createdAt: string;
      publicUrl: string;
    }> = [];

    let clicksObserved = 0;

    await page.route(`**/api/episodes/${EPISODE_ID}`, (route) => {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(episodeBody),
      });
    });

    await page.route(`**/api/episodes/${EPISODE_ID}/campaign`, async (route) => {
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON() as {
          launchPack?: Record<string, unknown>;
          status?: string;
        };
        if (body.launchPack && typeof body.launchPack === 'object') {
          campaign = {
            ...campaign,
            launchPack: { ...campaign.launchPack, ...body.launchPack } as typeof campaign.launchPack,
          };
        }
        if (body.status) {
          campaign = { ...campaign, status: body.status as typeof campaign.status };
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(campaign),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(campaign),
      });
    });

    await page.route('**/api/podsignal/trackable-links**', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as {
          episodeId: string;
          assetKind: string;
          targetUrl: string;
        };
        const row = {
          id: 'link-e2e-1',
          token: LINK_TOKEN,
          episodeId: body.episodeId,
          campaignId: campaign.id,
          assetKind: body.assetKind,
          channel: null,
          targetUrl: body.targetUrl,
          clicksObserved: 0,
          evidence: 'observed' as const,
          createdAt: new Date().toISOString(),
          publicUrl: `${origin}/r/${LINK_TOKEN}`,
        };
        links.length = 0;
        links.push(row);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: row.id,
            token: row.token,
            publicUrl: row.publicUrl,
            episodeId: row.episodeId,
            campaignId: row.campaignId,
            assetKind: row.assetKind,
            evidence: row.evidence,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ links }),
      });
    });

    await page.route('**/api/podsignal/report-summary', (route) => {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(reportSummaryPayload(clicksObserved)),
      });
    });

    await page.route(`**/r/${LINK_TOKEN}**`, async (route) => {
      clicksObserved = 1;
      await route.fulfill({
        status: 302,
        headers: { Location: 'https://example.com/e2e-destination' },
      });
    });

    await page.goto(`/episodes/${EPISODE_ID}/launch`);
    await expect(page.getByTestId('pilot-approve-launch-pack')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('pilot-approve-launch-pack').click();
    await page.getByTestId('pilot-trackable-target-url').fill('https://example.com/episode');
    await page.getByTestId('pilot-create-trackable-link').click();
    await expect(page.locator('code', { hasText: LINK_TOKEN }).first()).toBeVisible({ timeout: 10_000 });

    await page.goto('/reports');
    await expect(page.getByTestId('pilot-report-trackable-clicks')).toHaveText('0', { timeout: 15_000 });

    await page.goto(`${origin}/r/${LINK_TOKEN}`);

    await page.goto('/reports');
    await page.getByTestId('pilot-report-refresh').click();
    await expect(page.getByTestId('pilot-report-trackable-clicks')).toHaveText('1', { timeout: 15_000 });
  });
});
