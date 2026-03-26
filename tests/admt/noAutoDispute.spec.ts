/**
 * tests/admt/noAutoDispute.spec.ts
 *
 * ADMT compliance: No automated dispute filing — PDFs require human confirmation.
 */

import { test, expect } from '@playwright/test';
import { withTestMerchant } from '../fixtures/merchant.js';
import { createTestTransaction, hoursAgo } from '../fixtures/transactions.js';
import { buildReviewPayload, postWebhook } from '../fixtures/reviews.js';
import { db } from '../../src/db/index.js';
import { reviewsInvestigation } from '../../src/db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { pdfExists } from '../../src/pdf/vault.js';

/**
 * Helper: deliver webhook and wait for scoring.
 */
async function deliverAndScore(
  merchant: { id: string; googlePlaceId: string; webhookSecret: string },
): Promise<Record<string, any>> {
  await createTestTransaction({
    merchantId: merchant.id,
    posTransactionId: `TXN-ADMT-${Date.now()}`,
    customerName: 'Elena Martinez',
    lineItems: [
      { name: 'Caesar Salad', quantity: 1, price_cents: 1200 },
      { name: 'Grilled Salmon', quantity: 1, price_cents: 2400 },
    ],
    closedAt: hoursAgo(24),
    googlePlaceId: merchant.googlePlaceId,
  });

  const payload = buildReviewPayload(merchant.googlePlaceId, {
    reviewerDisplayName: 'Elena M.',
    reviewText: 'Had the Caesar Salad and Grilled Salmon — both great!',
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

test('PDF cannot be generated without human confirmation', async () => {
  await withTestMerchant(async (merchant) => {
    const inv = await deliverAndScore(merchant);

    // Attempt POST /disputes/:id/export directly (bypassing UI)
    const resp = await fetch(
      `http://localhost:3000/disputes/${inv.id}/export`,
      { method: 'POST' }
    );
    expect(resp.status).toBe(403);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.error).toBeTruthy();
    expect(typeof body.error).toBe('string');

    // Assert no PDF exists
    const exists = await pdfExists(inv.id);
    expect(exists).toBe(false);

    // Assert humanReviewedAt is null
    const rows = await db.select()
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.id, inv.id));
    expect(rows[0]!.humanReviewedAt).toBeNull();
  });
});

test('export route returns 409 for PENDING reviews', async () => {
  await withTestMerchant(async (merchant) => {
    // Insert a review directly with PENDING status (don't wait for scoring)
    const payload = buildReviewPayload(merchant.googlePlaceId);
    await postWebhook(payload, merchant.webhookSecret);

    // Get the review row immediately (should be PENDING)
    const rows = await db.select()
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.googleReviewId, payload.reviewId));
    const inv = rows[0]!;

    const resp = await fetch(
      `http://localhost:3000/disputes/${inv.id}/export`,
      { method: 'POST' }
    );
    // Either 403 (no human review) or 409 (not scored yet) — both block export
    expect([403, 409]).toContain(resp.status);
  });
});

test('export is idempotent once confirmed', async () => {
  await withTestMerchant(async (merchant) => {
    const inv = await deliverAndScore(merchant);

    // Skip if suppressed
    const score = inv.confidenceScore ?? 0;
    if (score < 50 || inv.matchStatus === 'NO_RECORD') {
      test.skip();
      return;
    }

    // Confirm via API
    const confirmResp = await fetch(
      `http://localhost:3000/api/console/investigations/${inv.id}/confirm`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantUserId: 'test-user-admt',
          acknowledgedSections: [1, 2, 3, 4, 5],
        }),
      }
    );
    expect(confirmResp.status).toBe(200);

    // Wait for PDF to generate
    let pdfReady = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (await pdfExists(inv.id)) {
        pdfReady = true;
        break;
      }
    }
    expect(pdfReady).toBe(true);

    // POST export again — should return already_generated
    const resp = await fetch(
      `http://localhost:3000/disputes/${inv.id}/export`,
      { method: 'POST' }
    );
    expect(resp.status).toBe(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.status).toBe('already_generated');
  });
});
