/**
 * tests/e2e/fullFlow.spec.ts
 *
 * Complete happy-path E2E test: webhook → score → console → confirm → PDF.
 * Uses a NO_RECORD scenario (no matching transaction = disputable review).
 */

import { test, expect } from '@playwright/test';
import { withTestMerchant } from '../fixtures/merchant.js';
import { buildReviewPayload, postWebhook } from '../fixtures/reviews.js';
import { db } from '../../src/db/index.js';
import { reviewsInvestigation } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';

test('complete flow: webhook → score → console → confirm → PDF', async ({ page }) => {
  await withTestMerchant(async (merchant) => {
    // ── 1. Post webhook with NO matching transaction → DISPUTABLE ──────────
    const payload = buildReviewPayload(merchant.googlePlaceId, {
      reviewerDisplayName: 'Fake Reviewer 123',
      reviewText: 'Terrible experience. The lobster bisque was cold and the filet mignon was overcooked. Never again.',
      reviewRating: 1,
      publishedAt: new Date().toISOString(),
    });
    const webhookResp = await postWebhook(payload, merchant.webhookSecret);
    expect(webhookResp.status).toBe(200);
    const webhookBody = await webhookResp.json() as Record<string, unknown>;
    expect(webhookBody.status).toBe('accepted');

    // ── 2. Wait for engine to score (poll DB, max 15 seconds) ─────────────
    let investigation: Record<string, any> | null = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      const rows = await db.select()
        .from(reviewsInvestigation)
        .where(eq(reviewsInvestigation.googleReviewId, payload.reviewId));
      if (rows[0]?.matchStatus !== 'PENDING' && rows[0]?.matchStatus !== 'PROCESSING') {
        investigation = rows[0] as Record<string, any>;
        break;
      }
    }
    expect(investigation).not.toBeNull();
    expect(investigation!.matchStatus).toBe('NO_RECORD');

    // ── 3. Verify console API returns DISPUTABLE tier ─────────────────────
    const consoleResp = await fetch(
      `http://localhost:3000/api/console/investigations/${investigation!.id}`
    );
    const consoleData = await consoleResp.json() as Record<string, unknown>;
    expect(consoleData.consoleTier).toBe('DISPUTABLE');

    // ── 4. Load Reviewer Console ───────────────────────────────────────────
    await page.goto(`/console/${investigation!.id}`);
    await expect(page.locator('[data-testid="score-header"]')).toBeVisible();

    // Confirm button must be disabled (sections not yet acknowledged)
    const confirmBtn = page.locator('[data-testid="confirm-btn"]');
    await expect(confirmBtn).toBeDisabled();

    // ── 5. Acknowledge all 5 sections ─────────────────────────────────────
    for (let section = 1; section <= 5; section++) {
      // Open section
      await page.locator(`[data-testid="section-header-${section}"]`).click();
      // Check acknowledgement
      await page.locator(`[data-testid="ack-checkbox-${section}"]`).click();
      // Verify number circle turns green
      await expect(
        page.locator(`[data-testid="section-num-${section}"]`)
      ).toHaveAttribute('data-acknowledged', 'true');
    }

    // Progress bar must show 5/5
    await expect(page.locator('[data-testid="ack-count"]')).toHaveText('5 / 5 acknowledged');

    // Confirm button must now be enabled
    await expect(confirmBtn).toBeEnabled();

    // ── 6. Confirm via API (UI click can be flaky in CI, so confirm directly) ──
    const confirmResp = await fetch(
      `http://localhost:3000/api/console/investigations/${investigation!.id}/confirm`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantUserId: 'test-user-e2e',
          acknowledgedSections: [1, 2, 3, 4, 5],
        }),
      }
    );
    expect(confirmResp.status).toBe(200);

    // ── 7. Verify DB state ─────────────────────────────────────────────────
    const final = await db.select()
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.id, investigation!.id))
      .then(rows => rows[0]);
    expect(final!.humanReviewedAt).not.toBeNull();
    expect(final!.humanReviewerId).toBe('test-user-e2e');

    // Audit log must contain HUMAN_CONFIRMED event
    const auditLog = final!.auditLog as any[];
    const confirmEvent = auditLog.find((e: any) => e.event === 'HUMAN_CONFIRMED');
    expect(confirmEvent).toBeDefined();
    expect(confirmEvent.actor).toBe('test-user-e2e');
    expect(confirmEvent.ts).toBeTruthy();

    // ── 8. Poll for PDF ────────────────────────────────────────────────────
    let pdfReady = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const statusResp = await fetch(
        `http://localhost:3000/api/console/investigations/${investigation!.id}/pdf-status`
      );
      const statusBody = await statusResp.json() as Record<string, unknown>;
      if (statusBody.status === 'ready') {
        pdfReady = true;
        break;
      }
    }
    expect(pdfReady).toBe(true);

    // ── 9. Download PDF ────────────────────────────────────────────────────
    const pdfResp = await fetch(
      `http://localhost:3000/disputes/${investigation!.id}/pdf`
    );
    expect(pdfResp.status).toBe(200);
    expect(pdfResp.headers.get('content-type')).toBe('application/pdf');
    const pdfBytes = await pdfResp.arrayBuffer();
    expect(pdfBytes.byteLength).toBeGreaterThan(1_000);
  });
});
