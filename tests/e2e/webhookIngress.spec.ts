/**
 * tests/e2e/webhookIngress.spec.ts
 *
 * Webhook delivery, HMAC verification, and idempotency tests.
 */

import { test, expect } from '@playwright/test';
import { withTestMerchant } from '../fixtures/merchant.js';
import { buildReviewPayload, postWebhook, signReviewPayload } from '../fixtures/reviews.js';
import { db } from '../../src/db/index.js';
import { reviewsInvestigation } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';

test('valid webhook is accepted and review row created', async () => {
  await withTestMerchant(async (merchant) => {
    const payload = buildReviewPayload(merchant.googlePlaceId, {
      reviewerDisplayName: 'Sarah K.',
      reviewText: 'Wonderful experience, the pasta was divine.',
      reviewRating: 5,
    });
    const resp = await postWebhook(payload, merchant.webhookSecret);
    expect(resp.status).toBe(200);
    const body = await resp.json() as Record<string, unknown>;
    expect(body.status).toBe('accepted');

    // Verify row exists in DB
    const rows = await db.select()
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.googleReviewId, payload.reviewId));
    expect(rows.length).toBe(1);
    expect(rows[0]!.matchStatus).toBe('PENDING');
    expect(rows[0]!.reviewerDisplayName).toBe('Sarah K.');
  });
});

test('invalid HMAC returns 401', async () => {
  await withTestMerchant(async (merchant) => {
    const payload = buildReviewPayload(merchant.googlePlaceId);
    const body = JSON.stringify(payload);
    const wrongSignature = signReviewPayload(body, 'wrong-secret-key-totally-fake');

    const resp = await fetch('http://localhost:3000/webhooks/google-review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Google-Signature': wrongSignature,
      },
      body,
    });
    expect(resp.status).toBe(401);

    // Verify no row created
    const rows = await db.select()
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.googleReviewId, payload.reviewId));
    expect(rows.length).toBe(0);
  });
});

test('duplicate webhook returns already_processed', async () => {
  await withTestMerchant(async (merchant) => {
    const payload = buildReviewPayload(merchant.googlePlaceId);

    // First post — should be accepted
    const resp1 = await postWebhook(payload, merchant.webhookSecret);
    expect(resp1.status).toBe(200);
    const body1 = await resp1.json() as Record<string, unknown>;
    expect(body1.status).toBe('accepted');

    // Second post with same reviewId — should be idempotent
    const resp2 = await postWebhook(payload, merchant.webhookSecret);
    expect(resp2.status).toBe(200);
    const body2 = await resp2.json() as Record<string, unknown>;
    expect(body2.status).toBe('already_processed');

    // Only one row in DB
    const rows = await db.select()
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.googleReviewId, payload.reviewId));
    expect(rows.length).toBe(1);
  });
});

test('unknown placeId returns 404', async () => {
  const payload = buildReviewPayload('ChIJ_nonexistent_place_id_xyz');
  const body = JSON.stringify(payload);
  // Sign with any secret — we don't know the real one
  const signature = signReviewPayload(body, 'doesnt-matter');

  const resp = await fetch('http://localhost:3000/webhooks/google-review', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Google-Signature': signature,
    },
    body,
  });
  // The server returns 404 for unknown placeId
  expect(resp.status).toBe(404);
});

test('webhook with missing signature returns 401', async () => {
  await withTestMerchant(async (merchant) => {
    const payload = buildReviewPayload(merchant.googlePlaceId);
    const body = JSON.stringify(payload);

    const resp = await fetch('http://localhost:3000/webhooks/google-review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // No X-Google-Signature header
      },
      body,
    });
    expect(resp.status).toBe(401);
  });
});
