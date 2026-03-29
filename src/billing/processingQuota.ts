/**
 * Episode transcription processing credits — maps subscription.reviewsUsed / reviewLimit
 * to PodSignal “runs” per billing period (same counters as Billing UI).
 *
 * Period rules:
 * - Paid (Stripe subscription id + currentPeriodEnd): counter resets when the billing period ends
 *   (clock past currentPeriodEnd) or when Stripe reports a new period (webhook).
 * - Free / no period end: counter resets each UTC calendar month (processingQuotaPeriodKey).
 */

import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { subscriptions } from '../db/schema.js';

export const DEFAULT_FREE_EPISODE_PROCESSING_LIMIT = 25;

/** UTC `YYYY-MM` — used for free-tier monthly buckets. */
export function utcMonthKey(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

type SubRow = typeof subscriptions.$inferSelect;
type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === '23505' || e.cause?.code === '23505';
}

export type ConsumeEpisodeProcessingCreditResult =
  | { ok: true; reviewsUsed: number; reviewLimit: number }
  | {
      ok: false;
      reviewsUsed: number;
      reviewLimit: number;
      code: 'EPISODE_PROCESSING_QUOTA_EXCEEDED';
    };

async function fetchSubForUpdate(tx: TransactionClient, merchantId: string): Promise<SubRow | undefined> {
  const [row] = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.merchantId, merchantId))
    .for('update')
    .limit(1);
  return row;
}

/**
 * Applies period rollover before counting usage. Returns the subscription row to use for limits.
 */
async function applyPeriodResetIfNeeded(
  tx: TransactionClient,
  merchantId: string,
  sub: SubRow,
): Promise<SubRow> {
  const stripeSubId = sub.stripeSubscriptionId;
  const periodEnd = sub.currentPeriodEnd;

  if (stripeSubId && periodEnd) {
    const endMs = periodEnd instanceof Date ? periodEnd.getTime() : new Date(periodEnd).getTime();
    if (Date.now() >= endMs) {
      await tx
        .update(subscriptions)
        .set({ reviewsUsed: 0, processingQuotaPeriodKey: null, updatedAt: new Date() })
        .where(eq(subscriptions.merchantId, merchantId));
      const fresh = await fetchSubForUpdate(tx, merchantId);
      if (!fresh) throw new Error('Subscription row missing after period reset');
      return fresh;
    }
    return sub;
  }

  const key = utcMonthKey();
  if (sub.processingQuotaPeriodKey !== key) {
    await tx
      .update(subscriptions)
      .set({ reviewsUsed: 0, processingQuotaPeriodKey: key, updatedAt: new Date() })
      .where(eq(subscriptions.merchantId, merchantId));
    const fresh = await fetchSubForUpdate(tx, merchantId);
    if (!fresh) throw new Error('Subscription row missing after month reset');
    return fresh;
  }

  return sub;
}

/**
 * Locks the merchant subscription row, creates a free-tier row if missing, then increments
 * reviewsUsed when under reviewLimit.
 */
export async function consumeEpisodeProcessingCredit(
  merchantId: string,
): Promise<ConsumeEpisodeProcessingCreditResult> {
  return db.transaction(async (tx) => {
    let sub = await fetchSubForUpdate(tx, merchantId);

    if (!sub) {
      try {
        await tx.insert(subscriptions).values({
          merchantId,
          stripeCustomerId: null,
          plan: 'free',
          status: 'active',
          reviewLimit: DEFAULT_FREE_EPISODE_PROCESSING_LIMIT,
          reviewsUsed: 0,
          processingQuotaPeriodKey: utcMonthKey(),
        });
      } catch (e: unknown) {
        if (!isUniqueViolation(e)) throw e;
      }
      sub = await fetchSubForUpdate(tx, merchantId);
    }

    if (!sub) {
      throw new Error('Failed to resolve subscription row for merchant');
    }

    sub = await applyPeriodResetIfNeeded(tx, merchantId, sub);

    if (sub.reviewsUsed >= sub.reviewLimit) {
      return {
        ok: false,
        reviewsUsed: sub.reviewsUsed,
        reviewLimit: sub.reviewLimit,
        code: 'EPISODE_PROCESSING_QUOTA_EXCEEDED',
      };
    }

    const nextUsed = sub.reviewsUsed + 1;
    await tx
      .update(subscriptions)
      .set({ reviewsUsed: nextUsed, updatedAt: new Date() })
      .where(eq(subscriptions.merchantId, merchantId));

    return { ok: true, reviewsUsed: nextUsed, reviewLimit: sub.reviewLimit };
  });
}

/** Decrement after a failed enqueue so the user is not charged for a job that never started. */
export async function refundEpisodeProcessingCredit(merchantId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.merchantId, merchantId))
      .for('update')
      .limit(1);
    if (!sub || sub.reviewsUsed <= 0) return;
    await tx
      .update(subscriptions)
      .set({ reviewsUsed: sub.reviewsUsed - 1, updatedAt: new Date() })
      .where(eq(subscriptions.merchantId, merchantId));
  });
}
