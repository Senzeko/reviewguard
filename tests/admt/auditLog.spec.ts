/**
 * tests/admt/auditLog.spec.ts
 *
 * ADMT compliance: audit_log completeness and chronological ordering.
 */

import { test, expect } from '@playwright/test';
import { withTestMerchant } from '../fixtures/merchant.js';
import { createTestTransaction, hoursAgo } from '../fixtures/transactions.js';
import { buildReviewPayload, postWebhook } from '../fixtures/reviews.js';
import { db } from '../../src/db/index.js';
import { reviewsInvestigation } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { pdfExists } from '../../src/pdf/vault.js';

/**
 * Helper: setup merchant, create transaction, deliver webhook.
 * Returns { merchant, payload, investigationId } once the review row exists.
 */
async function setupAndDeliver(merchant: {
  id: string;
  googlePlaceId: string;
  webhookSecret: string;
}) {
  await createTestTransaction({
    merchantId: merchant.id,
    posTransactionId: `TXN-AUDIT-${Date.now()}`,
    customerName: 'Lena Kowalski',
    lineItems: [
      { name: 'Pad Thai', quantity: 1, price_cents: 1400 },
      { name: 'Thai Iced Tea', quantity: 1, price_cents: 500 },
    ],
    closedAt: hoursAgo(18),
    googlePlaceId: merchant.googlePlaceId,
  });

  const payload = buildReviewPayload(merchant.googlePlaceId, {
    reviewerDisplayName: 'Lena K.',
    reviewText: 'The Pad Thai was fantastic — just like in Bangkok!',
    reviewRating: 5,
  });
  await postWebhook(payload, merchant.webhookSecret);

  // Wait for the row to exist
  let investigationId = '';
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 300));
    const rows = await db.select({ id: reviewsInvestigation.id })
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.googleReviewId, payload.reviewId));
    if (rows[0]) {
      investigationId = rows[0].id;
      break;
    }
  }

  return { payload, investigationId };
}

function getAuditLog(row: Record<string, any>): any[] {
  return (row.auditLog ?? []) as any[];
}

test('audit_log contains WEBHOOK_RECEIVED event after ingestion', async () => {
  await withTestMerchant(async (merchant) => {
    const { investigationId } = await setupAndDeliver(merchant);
    expect(investigationId).toBeTruthy();

    const rows = await db.select()
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.id, investigationId));
    const log = getAuditLog(rows[0]!);
    const webhookEvent = log.find((e: any) => e.event === 'WEBHOOK_RECEIVED');
    expect(webhookEvent).toBeDefined();
    expect(webhookEvent.actor).toBe('ingress');
  });
});

test('audit_log contains ENGINE_SCORED event after scoring', async () => {
  await withTestMerchant(async (merchant) => {
    const { investigationId } = await setupAndDeliver(merchant);

    // Wait for engine to score
    let row: Record<string, any> | null = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      const rows = await db.select()
        .from(reviewsInvestigation)
        .where(eq(reviewsInvestigation.id, investigationId));
      if (rows[0]?.matchStatus !== 'PENDING' && rows[0]?.matchStatus !== 'PROCESSING') {
        row = rows[0] as Record<string, any>;
        break;
      }
    }
    expect(row).not.toBeNull();

    const log = getAuditLog(row!);
    const scoreEvent = log.find((e: any) => e.event === 'ENGINE_SCORED');
    expect(scoreEvent).toBeDefined();
    expect(scoreEvent.actor).toBe('forensic_engine');
    // Detail should contain the confidence score
    expect(scoreEvent.detail).toContain('Score:');
  });
});

test('audit_log contains HUMAN_CONFIRMED event after confirm', async () => {
  await withTestMerchant(async (merchant) => {
    const { investigationId } = await setupAndDeliver(merchant);

    // Wait for scoring
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      const rows = await db.select()
        .from(reviewsInvestigation)
        .where(eq(reviewsInvestigation.id, investigationId));
      if (rows[0]?.matchStatus !== 'PENDING' && rows[0]?.matchStatus !== 'PROCESSING') {
        break;
      }
    }

    // Check if the review is not disputable (LEGITIMATE or suppressed)
    const check = await db.select()
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.id, investigationId));
    const score = check[0]?.confidenceScore ?? 0;
    const status = check[0]?.matchStatus;
    // Skip if LEGITIMATE (score >= 75 + VERIFIED) or suppressed (low score / NO_RECORD)
    if (status === 'NO_RECORD' || (score >= 75 && status === 'VERIFIED') || score < 50) {
      test.skip();
      return;
    }

    // Confirm via API
    const confirmResp = await fetch(
      `http://localhost:3000/api/console/investigations/${investigationId}/confirm`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantUserId: 'audit-test-user',
          acknowledgedSections: [1, 2, 3, 4, 5],
        }),
      }
    );
    expect(confirmResp.status).toBe(200);

    // Check audit log
    const rows = await db.select()
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.id, investigationId));
    const log = getAuditLog(rows[0]!);
    const confirmEvent = log.find((e: any) => e.event === 'HUMAN_CONFIRMED');
    expect(confirmEvent).toBeDefined();
    expect(confirmEvent.ts).toBeTruthy();
    // ts should be a valid ISO timestamp
    expect(new Date(confirmEvent.ts).toISOString()).toBe(confirmEvent.ts);
    expect(confirmEvent.actor).toBe('audit-test-user');
  });
});

test('audit_log contains PDF_GENERATED event after PDF creation', async () => {
  await withTestMerchant(async (merchant) => {
    const { investigationId } = await setupAndDeliver(merchant);

    // Wait for scoring
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      const rows = await db.select()
        .from(reviewsInvestigation)
        .where(eq(reviewsInvestigation.id, investigationId));
      if (rows[0]?.matchStatus !== 'PENDING' && rows[0]?.matchStatus !== 'PROCESSING') {
        break;
      }
    }

    const check = await db.select()
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.id, investigationId));
    const score = check[0]?.confidenceScore ?? 0;
    const status = check[0]?.matchStatus;
    if (status === 'NO_RECORD' || (score >= 75 && status === 'VERIFIED') || score < 50) {
      test.skip();
      return;
    }

    // Confirm
    await fetch(
      `http://localhost:3000/api/console/investigations/${investigationId}/confirm`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantUserId: 'pdf-audit-user',
          acknowledgedSections: [1, 2, 3, 4, 5],
        }),
      }
    );

    // Wait for PDF
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (await pdfExists(investigationId)) break;
    }
    expect(await pdfExists(investigationId)).toBe(true);

    // Check audit log for PDF event
    const rows = await db.select()
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.id, investigationId));
    const log = getAuditLog(rows[0]!);
    const pdfEvent = log.find((e: any) => e.event === 'PDF_GENERATED');
    expect(pdfEvent).toBeDefined();
    expect(pdfEvent.actor).toBe('system');
    // Detail should contain the caseId
    expect(pdfEvent.detail).toBeTruthy();
  });
});

test('audit_log events are in chronological order', async () => {
  await withTestMerchant(async (merchant) => {
    const { investigationId } = await setupAndDeliver(merchant);

    // Wait for scoring
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      const rows = await db.select()
        .from(reviewsInvestigation)
        .where(eq(reviewsInvestigation.id, investigationId));
      if (rows[0]?.matchStatus !== 'PENDING' && rows[0]?.matchStatus !== 'PROCESSING') {
        break;
      }
    }

    const rows = await db.select()
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.id, investigationId));
    const log = getAuditLog(rows[0]!);

    // Parse all timestamps and verify non-decreasing order
    const timestamps = log.map((e: any) => new Date(e.ts).getTime());
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]!);
    }
  });
});

test('audit_log is append-only during the test run', async () => {
  await withTestMerchant(async (merchant) => {
    const { investigationId } = await setupAndDeliver(merchant);

    // Check length after ingestion
    let rows = await db.select()
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.id, investigationId));
    const lenAfterIngest = getAuditLog(rows[0]!).length;
    expect(lenAfterIngest).toBeGreaterThanOrEqual(1);

    // Wait for scoring
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      rows = await db.select()
        .from(reviewsInvestigation)
        .where(eq(reviewsInvestigation.id, investigationId));
      if (rows[0]?.matchStatus !== 'PENDING' && rows[0]?.matchStatus !== 'PROCESSING') {
        break;
      }
    }

    const lenAfterScore = getAuditLog(rows[0]!).length;
    expect(lenAfterScore).toBeGreaterThanOrEqual(lenAfterIngest);
  });
});
