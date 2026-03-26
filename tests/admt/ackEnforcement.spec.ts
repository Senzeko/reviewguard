/**
 * tests/admt/ackEnforcement.spec.ts
 *
 * ADMT compliance: Confirm is blocked without all 5 section acknowledgements.
 */

import { test, expect } from '@playwright/test';
import { withTestMerchant } from '../fixtures/merchant.js';
import { createTestTransaction, hoursAgo } from '../fixtures/transactions.js';
import { buildReviewPayload, postWebhook } from '../fixtures/reviews.js';
import { db } from '../../src/db/index.js';
import { reviewsInvestigation } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Helper: deliver webhook and wait for scoring, return scored investigation.
 */
async function setupScoredInvestigation(
  merchant: { id: string; googlePlaceId: string; webhookSecret: string },
): Promise<Record<string, any>> {
  await createTestTransaction({
    merchantId: merchant.id,
    posTransactionId: `TXN-ACK-${Date.now()}`,
    customerName: 'Nina Petrova',
    lineItems: [
      { name: 'Margherita Pizza', quantity: 1, price_cents: 1600 },
      { name: 'Garlic Bread', quantity: 1, price_cents: 600 },
    ],
    closedAt: hoursAgo(36),
    googlePlaceId: merchant.googlePlaceId,
  });

  const payload = buildReviewPayload(merchant.googlePlaceId, {
    reviewerDisplayName: 'Nina P.',
    reviewText: 'Loved the Margherita Pizza — best I have had in town!',
    reviewRating: 4,
  });
  await postWebhook(payload, merchant.webhookSecret);

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

test('confirm API rejects request with missing sections', async () => {
  await withTestMerchant(async (merchant) => {
    const inv = await setupScoredInvestigation(merchant);

    const resp = await fetch(
      `http://localhost:3000/api/console/investigations/${inv.id}/confirm`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantUserId: 'test-user',
          acknowledgedSections: [1, 2, 3],
        }),
      }
    );
    expect(resp.status).toBe(400);

    // Verify humanReviewedAt remains null
    const rows = await db.select()
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.id, inv.id));
    expect(rows[0]!.humanReviewedAt).toBeNull();
  });
});

test('confirm API rejects request with empty sections', async () => {
  await withTestMerchant(async (merchant) => {
    const inv = await setupScoredInvestigation(merchant);

    const resp = await fetch(
      `http://localhost:3000/api/console/investigations/${inv.id}/confirm`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantUserId: 'test-user',
          acknowledgedSections: [],
        }),
      }
    );
    expect(resp.status).toBe(400);
  });
});

test('confirm API rejects request with extra sections', async () => {
  await withTestMerchant(async (merchant) => {
    const inv = await setupScoredInvestigation(merchant);

    const resp = await fetch(
      `http://localhost:3000/api/console/investigations/${inv.id}/confirm`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantUserId: 'test-user',
          acknowledgedSections: [1, 2, 3, 4, 5, 6],
        }),
      }
    );
    expect(resp.status).toBe(400);
  });
});

test('confirm button is disabled until all 5 sections acknowledged', async ({ page }) => {
  await withTestMerchant(async (merchant) => {
    const inv = await setupScoredInvestigation(merchant);

    // Skip if suppressed
    const score = inv.confidenceScore ?? 0;
    if (score < 50 || inv.matchStatus === 'NO_RECORD') {
      test.skip();
      return;
    }

    await page.goto(`/console/${inv.id}`);
    await expect(page.locator('[data-testid="score-header"]')).toBeVisible();

    const confirmBtn = page.locator('[data-testid="confirm-btn"]');
    await expect(confirmBtn).toBeDisabled();

    // Acknowledge sections 1–4 only
    for (let section = 1; section <= 4; section++) {
      await page.locator(`[data-testid="section-header-${section}"]`).click();
      await page.locator(`[data-testid="ack-checkbox-${section}"]`).click();
    }

    // Still disabled
    await expect(confirmBtn).toBeDisabled();

    // Acknowledge section 5
    await page.locator('[data-testid="section-header-5"]').click();
    await page.locator('[data-testid="ack-checkbox-5"]').click();

    // Now enabled
    await expect(confirmBtn).toBeEnabled();
  });
});

test('acknowledged sections cannot be un-acknowledged', async ({ page }) => {
  await withTestMerchant(async (merchant) => {
    const inv = await setupScoredInvestigation(merchant);

    const score = inv.confidenceScore ?? 0;
    if (score < 50 || inv.matchStatus === 'NO_RECORD') {
      test.skip();
      return;
    }

    await page.goto(`/console/${inv.id}`);
    await expect(page.locator('[data-testid="score-header"]')).toBeVisible();

    // Open section 1 and acknowledge it
    await page.locator('[data-testid="section-header-1"]').click();
    await page.locator('[data-testid="ack-checkbox-1"]').click();

    // Checkbox is checked and disabled (cannot uncheck)
    const checkbox = page.locator('[data-testid="ack-checkbox-1"]');
    await expect(checkbox).toBeChecked();
    await expect(checkbox).toBeDisabled();

    // Section number shows green check
    await expect(
      page.locator('[data-testid="section-num-1"]')
    ).toHaveAttribute('data-acknowledged', 'true');

    // Reload the page — acknowledgement state resets (per-session)
    await page.reload();
    await expect(page.locator('[data-testid="score-header"]')).toBeVisible();

    // Open section 1 again
    await page.locator('[data-testid="section-header-1"]').click();
    const checkboxAfterReload = page.locator('[data-testid="ack-checkbox-1"]');
    // Should NOT be checked — fresh session
    await expect(checkboxAfterReload).not.toBeChecked();
  });
});
