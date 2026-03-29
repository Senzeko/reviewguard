/**
 * PodSignal reliability E2E — billing + SSE (mocked network; no live Stripe).
 * Run via `npm run test:e2e:reliability` (vite preview on :4173, see playwright.reliability.config.ts).
 */

import { test, expect } from '@playwright/test';

const MOCK_USER = {
  userId: 'e2e-user',
  email: 'e2e@test.local',
  fullName: 'E2E',
  merchantId: 'e2e-merchant',
  merchant: {
    id: 'e2e-merchant',
    businessName: 'E2E Co',
    posProvider: 'SQUARE',
    isActive: true,
    lastSyncAt: null as string | null,
  },
};

const MOCK_BILLING = {
  plan: 'free',
  status: 'active',
  reviewLimit: 25,
  reviewsUsed: 0,
  currentPeriodEnd: null as string | null,
  stripeConfigured: true,
};

async function mockAuth(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_USER),
    });
  });
}

test.describe('PodSignal billing (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
  });

  test('checkout POST is single-fire when double-clicked during in-flight request', async ({ page }) => {
    let checkoutCalls = 0;
    await page.route('**/api/billing/status', (route) => {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_BILLING),
      });
    });
    await page.route('**/api/billing/checkout', async (route) => {
      checkoutCalls += 1;
      await new Promise((r) => setTimeout(r, 900));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: null }),
      });
    });

    await page.goto('/billing');
    const starter = page.getByTestId('billing-upgrade-starter');
    await expect(starter).toBeVisible();
    await starter.click();
    await starter.click();
    await expect.poll(() => checkoutCalls, { timeout: 5_000 }).toBe(1);
  });

  test('return ?checkout=success shows reconciliation pending banner', async ({ page }) => {
    await page.route('**/api/billing/status', (route) => {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_BILLING),
      });
    });

    await page.goto('/billing?checkout=success');
    await expect(page.getByTestId('billing-return-pending')).toBeVisible({ timeout: 10_000 });
  });

  test('return ?checkout=canceled shows canceled banner', async ({ page }) => {
    await page.route('**/api/billing/status', (route) => {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_BILLING),
      });
    });

    await page.goto('/billing?checkout=canceled');
    await expect(page.getByTestId('billing-return-canceled')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('PodSignal SSE dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
  });

  test('dashboard shows degraded when SSE stream is aborted', async ({ page }) => {
    await page.route('**/api/sse/events', (route) => route.abort());
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-sse-degraded')).toBeVisible({ timeout: 15_000 });
  });

  // Recovery after reload with a live stream is deferred: EventSource uses cookies; mocked /api/auth/me
  // does not create a session, so unroute + reload hits /api/sse/events without auth (403) and stays
  // degraded. Cover recovery in manual QA with a real logged-in session or future fixture-based login.
});
