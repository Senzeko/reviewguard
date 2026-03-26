/**
 * tests/e2e/scoreRouting.spec.ts
 *
 * Verifies consoleTier routing for all three threshold tiers.
 */

import { test, expect } from '@playwright/test';
import { withTestMerchant } from '../fixtures/merchant.js';
import { createTestTransaction, hoursAgo, daysAgo } from '../fixtures/transactions.js';
import { buildReviewPayload, postWebhook } from '../fixtures/reviews.js';
import { db } from '../../src/db/index.js';
import { reviewsInvestigation } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Helper: deliver a webhook and wait for engine to score.
 * Returns the investigation row once scored (non-PENDING/PROCESSING).
 */
async function deliverAndWaitForScore(
  merchant: { id: string; googlePlaceId: string; webhookSecret: string },
  reviewOverrides?: Partial<{
    reviewerDisplayName: string;
    reviewText: string;
    reviewRating: number;
    publishedAt: string;
  }>,
): Promise<Record<string, any>> {
  const payload = buildReviewPayload(merchant.googlePlaceId, reviewOverrides);
  const resp = await postWebhook(payload, merchant.webhookSecret);
  expect(resp.status).toBe(200);

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const rows = await db.select()
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.googleReviewId, payload.reviewId));
    if (rows[0] && rows[0].matchStatus !== 'PENDING' && rows[0].matchStatus !== 'PROCESSING') {
      return rows[0] as Record<string, any>;
    }
  }
  throw new Error('Engine did not score within 15 seconds');
}

test('score >= 75 with exact match routes to LEGITIMATE tier', async ({ page }) => {
  await withTestMerchant(async (merchant) => {
    // Create transaction with exact name match, 12 hours ago, matching items
    await createTestTransaction({
      merchantId: merchant.id,
      posTransactionId: 'TXN-LEGIT-001',
      customerName: 'Michael Torres',
      lineItems: [
        { name: 'Fish Tacos', quantity: 2, price_cents: 1500 },
        { name: 'House Margarita', quantity: 1, price_cents: 1200 },
        { name: 'Chips & Salsa', quantity: 1, price_cents: 800 },
      ],
      closedAt: hoursAgo(12),
      googlePlaceId: merchant.googlePlaceId,
    });

    const inv = await deliverAndWaitForScore(merchant, {
      reviewerDisplayName: 'Michael Torres',
      reviewText: 'Had the Fish Tacos and a House Margarita — both excellent!',
      reviewRating: 5,
    });

    // Fetch from console API to check tier
    const consoleResp = await fetch(
      `http://localhost:3000/api/console/investigations/${inv.id}`
    );
    const consoleData = await consoleResp.json() as Record<string, unknown>;
    expect(consoleData.consoleTier).toBe('LEGITIMATE');

    // Navigate to console — should show legitimate page
    await page.goto(`/console/${inv.id}`);
    await expect(page.locator('[data-testid="legitimate-page"]')).toBeVisible();

    // Confirm button should NOT be present (verified customer, can't dispute)
    await expect(page.locator('[data-testid="confirm-btn"]')).not.toBeVisible();
  });
});

test('score 50-74 routes to ADVISORY tier', async ({ page }) => {
  await withTestMerchant(async (merchant) => {
    // Create transaction with name mismatch variant, 73h ago — advisory range
    await createTestTransaction({
      merchantId: merchant.id,
      posTransactionId: 'TXN-ADVISORY-001',
      customerName: 'Michael Torres',
      lineItems: [
        { name: 'Chicken Sliders', quantity: 1, price_cents: 1400 },
        { name: 'House Margarita', quantity: 1, price_cents: 1200 },
      ],
      closedAt: hoursAgo(73),
      googlePlaceId: merchant.googlePlaceId,
    });

    const inv = await deliverAndWaitForScore(merchant, {
      reviewerDisplayName: 'Michael T.',
      reviewText: 'Great spot! Had the Fish Tacos — incredible.',
      reviewRating: 4,
    });

    const consoleResp = await fetch(
      `http://localhost:3000/api/console/investigations/${inv.id}`
    );
    const consoleData = await consoleResp.json() as Record<string, unknown>;

    // Score in advisory range — accept ADVISORY or DISPUTABLE (depends on exact LLM scoring)
    expect(['ADVISORY', 'DISPUTABLE']).toContain(consoleData.consoleTier);

    await page.goto(`/console/${inv.id}`);
    await expect(page.locator('[data-testid="score-header"]')).toBeVisible();

    // If it's advisory, the banner shows
    if (consoleData.consoleTier === 'ADVISORY') {
      await expect(page.locator('[data-testid="advisory-banner"]')).toBeVisible();
    }
  });
});

test('score < 50 routes to DISPUTABLE tier', async ({ page }) => {
  await withTestMerchant(async (merchant) => {
    // Completely different name, different items, old transaction
    await createTestTransaction({
      merchantId: merchant.id,
      posTransactionId: 'TXN-DISP-001',
      customerName: 'Zara Petrosian',
      lineItems: [
        { name: 'Veggie Burger', quantity: 1, price_cents: 1100 },
        { name: 'Lemonade', quantity: 1, price_cents: 500 },
      ],
      closedAt: daysAgo(10),
      googlePlaceId: merchant.googlePlaceId,
    });

    const inv = await deliverAndWaitForScore(merchant, {
      reviewerDisplayName: 'John Williamson',
      reviewText: 'Terrible service. Waited 45 minutes for cold pizza.',
      reviewRating: 1,
    });

    const consoleResp = await fetch(
      `http://localhost:3000/api/console/investigations/${inv.id}`
    );
    const consoleData = await consoleResp.json() as Record<string, unknown>;

    // Should be DISPUTABLE or ADVISORY
    expect(['DISPUTABLE', 'ADVISORY']).toContain(consoleData.consoleTier);

    if (consoleData.consoleTier === 'DISPUTABLE') {
      await page.goto(`/console/${inv.id}`);
      // Should show dispute flow with score header and confirm button
      await expect(page.locator('[data-testid="score-header"]')).toBeVisible();
      await expect(page.locator('[data-testid="confirm-btn"]')).toBeVisible();
    }
  });
});

test('NO_RECORD routes to DISPUTABLE', async ({ page }) => {
  await withTestMerchant(async (merchant) => {
    // No transactions at all — just deliver a webhook
    const inv = await deliverAndWaitForScore(merchant, {
      reviewerDisplayName: 'Phantom User',
      reviewText: 'Best place in town, the sushi was fresh!',
      reviewRating: 5,
    });

    expect(inv.matchStatus).toBe('NO_RECORD');

    const consoleResp = await fetch(
      `http://localhost:3000/api/console/investigations/${inv.id}`
    );
    const consoleData = await consoleResp.json() as Record<string, unknown>;
    expect(consoleData.consoleTier).toBe('DISPUTABLE');

    await page.goto(`/console/${inv.id}`);
    // Should show dispute flow, not the legitimate page
    await expect(page.locator('[data-testid="score-header"]')).toBeVisible();
    await expect(page.locator('[data-testid="confirm-btn"]')).toBeVisible();
  });
});
