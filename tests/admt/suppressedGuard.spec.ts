/**
 * tests/admt/suppressedGuard.spec.ts
 *
 * ADMT compliance: Legitimate (verified customer) reviews cannot be confirmed or disputed.
 */

import { test, expect } from '@playwright/test';
import { withTestMerchant } from '../fixtures/merchant.js';
import { createTestTransaction, hoursAgo } from '../fixtures/transactions.js';
import { buildReviewPayload, postWebhook } from '../fixtures/reviews.js';
import { db } from '../../src/db/index.js';
import { reviewsInvestigation } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Deliver a review with an exact-match transaction → VERIFIED/LEGITIMATE.
 */
async function createLegitimateInvestigation(
  merchant: { id: string; googlePlaceId: string; webhookSecret: string },
): Promise<Record<string, any>> {
  // Create a matching transaction so the engine scores high
  await createTestTransaction({
    merchantId: merchant.id,
    posTransactionId: 'TXN-LEGIT-001',
    customerName: 'Sarah Johnson',
    lineItems: [
      { name: 'Fish Tacos', quantity: 2, price_cents: 1500 },
      { name: 'House Margarita', quantity: 1, price_cents: 1200 },
    ],
    closedAt: hoursAgo(12),
    googlePlaceId: merchant.googlePlaceId,
  });

  const payload = buildReviewPayload(merchant.googlePlaceId, {
    reviewerDisplayName: 'Sarah Johnson',
    reviewText: 'Had the Fish Tacos and a House Margarita — both excellent!',
    reviewRating: 5,
  });
  await postWebhook(payload, merchant.webhookSecret);

  // Wait for engine to score
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const rows = await db.select()
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.googleReviewId, payload.reviewId));
    const row = rows[0];
    if (row && row.matchStatus !== 'PENDING' && row.matchStatus !== 'PROCESSING') {
      return row as Record<string, any>;
    }
  }
  throw new Error('Engine did not score within 15 seconds');
}

test('legitimate review cannot be confirmed via API', async () => {
  await withTestMerchant(async (merchant) => {
    const inv = await createLegitimateInvestigation(merchant);

    // Verify it's legitimate via the console API
    const consoleResp = await fetch(
      `http://localhost:3000/api/console/investigations/${inv.id}`
    );
    const consoleData = await consoleResp.json() as Record<string, unknown>;
    expect(consoleData.consoleTier).toBe('LEGITIMATE');

    // Attempt to confirm with all 5 sections — should be blocked
    const confirmResp = await fetch(
      `http://localhost:3000/api/console/investigations/${inv.id}/confirm`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantUserId: 'legitimate-test-user',
          acknowledgedSections: [1, 2, 3, 4, 5],
        }),
      }
    );
    expect(confirmResp.status).toBe(403);

    // Verify humanReviewedAt remains null
    const rows = await db.select()
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.id, inv.id));
    expect(rows[0]!.humanReviewedAt).toBeNull();
  });
});

test('legitimate review shows legitimate page in browser', async ({ page }) => {
  await withTestMerchant(async (merchant) => {
    const inv = await createLegitimateInvestigation(merchant);

    await page.goto(`/console/${inv.id}`);

    // Should show legitimate page
    await expect(page.locator('[data-testid="legitimate-page"]')).toBeVisible();

    // No evidence section headers should be visible
    await expect(page.locator('[data-testid="section-header-1"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="section-header-2"]')).not.toBeVisible();

    // No confirm button visible
    await expect(page.locator('[data-testid="confirm-btn"]')).not.toBeVisible();
  });
});
