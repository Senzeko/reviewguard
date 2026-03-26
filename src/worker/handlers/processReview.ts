/**
 * src/worker/handlers/processReview.ts
 *
 * Handles PROCESS_NEW_REVIEW jobs — looks up candidate transactions
 * and appends to audit_log. Does NOT run the ForensicMatchEngine
 * (that is Session 3's engine worker).
 */

import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  merchants,
  transactionsVault,
  reviewsInvestigation,
} from '../../db/schema.js';
import type { ProcessNewReviewJob } from '../../queue/jobs.js';

export async function handleProcessReview(
  job: ProcessNewReviewJob,
): Promise<void> {
  // 1. Look up merchant
  const [merchant] = await db
    .select()
    .from(merchants)
    .where(eq(merchants.id, job.merchantId))
    .limit(1);

  if (!merchant) {
    console.warn(
      `[worker] PROCESS_NEW_REVIEW: merchant ${job.merchantId} not found — skipping`,
    );
    return;
  }

  // 2. Find candidate transactions in 14-day window
  const reviewDate = new Date(job.reviewPublishedAt);
  const windowStart = new Date(
    reviewDate.getTime() - 14 * 24 * 60 * 60 * 1000,
  );
  const windowEnd = new Date(
    reviewDate.getTime() + 1 * 24 * 60 * 60 * 1000,
  );

  const transactions = await db
    .select()
    .from(transactionsVault)
    .where(
      and(
        eq(transactionsVault.merchantId, job.merchantId),
        gte(transactionsVault.closedAt, windowStart),
        lte(transactionsVault.closedAt, windowEnd),
      ),
    );

  console.log(
    `[worker] PROCESS_NEW_REVIEW: review ${job.googleReviewId} — found ${transactions.length} candidate transactions`,
  );

  // 3. Update audit_log on the review row
  const auditEntry = {
    event: 'REVIEW_QUEUED',
    actor: 'worker',
    ts: new Date().toISOString(),
    detail: `Candidate transactions found: ${transactions.length}`,
  };

  await db
    .update(reviewsInvestigation)
    .set({
      matchStatus: 'PENDING',
      auditLog: sql`${reviewsInvestigation.auditLog} || ${JSON.stringify([auditEntry])}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(reviewsInvestigation.googleReviewId, job.googleReviewId));
}
