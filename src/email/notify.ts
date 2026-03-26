/**
 * src/email/notify.ts
 *
 * Notification dispatcher — looks up merchant users, checks their preferences,
 * and sends appropriate emails.
 * Called from worker handlers and engine worker after state transitions.
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  merchantUsers,
  merchants,
  reviewsInvestigation,
} from '../db/schema.js';
import {
  notifyNewReview,
  notifyScoringComplete,
  notifyPdfReady,
  notifyPosSyncComplete,
} from './service.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface NotifPrefs {
  onNewReview: boolean;
  onScoringComplete: boolean;
  onPdfReady: boolean;
  onPosSync: boolean;
  dailyDigest: boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
  onNewReview: true,
  onScoringComplete: true,
  onPdfReady: true,
  onPosSync: true,
  dailyDigest: false,
};

interface MerchantUserInfo {
  email: string;
  prefs: NotifPrefs;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetches all active merchant users with their notification preferences.
 */
async function getMerchantUsers(merchantId: string): Promise<MerchantUserInfo[]> {
  const users = await db
    .select({
      email: merchantUsers.email,
      notificationPrefs: merchantUsers.notificationPrefs,
    })
    .from(merchantUsers)
    .where(
      and(
        eq(merchantUsers.merchantId, merchantId),
        eq(merchantUsers.isActive, true),
      ),
    );
  return users.map((u) => ({
    email: u.email,
    prefs: (u.notificationPrefs as NotifPrefs | null) ?? DEFAULT_PREFS,
  }));
}

/**
 * Fetches merchant business name.
 */
async function getMerchantName(merchantId: string): Promise<string> {
  const rows = await db
    .select({ businessName: merchants.businessName })
    .from(merchants)
    .where(eq(merchants.id, merchantId))
    .limit(1);
  return rows[0]?.businessName ?? 'Your business';
}

// ── Notification triggers ────────────────────────────────────────────────────

/**
 * Called when a new Google review webhook is processed.
 */
export async function onNewReview(params: {
  merchantId: string;
  investigationId: string;
  reviewerName: string;
  rating: number;
  reviewText: string;
}): Promise<void> {
  try {
    const [users, merchantName] = await Promise.all([
      getMerchantUsers(params.merchantId),
      getMerchantName(params.merchantId),
    ]);

    await Promise.all(
      users
        .filter((u) => u.prefs.onNewReview)
        .map((u) =>
          notifyNewReview({
            to: u.email,
            merchantName,
            reviewerName: params.reviewerName,
            rating: params.rating,
            reviewText: params.reviewText,
            investigationId: params.investigationId,
          }),
        ),
    );
  } catch (err) {
    console.error('[notify] onNewReview error:', err);
  }
}

type ConsoleTier = 'LEGITIMATE' | 'ADVISORY' | 'DISPUTABLE' | 'NOT_READY';

function computeConsoleTier(matchStatus: string, confidenceScore: number): ConsoleTier {
  if (matchStatus === 'PENDING' || matchStatus === 'PROCESSING') return 'NOT_READY';
  if (confidenceScore >= 75 && matchStatus === 'VERIFIED') return 'LEGITIMATE';
  if (confidenceScore >= 50 && matchStatus !== 'NO_RECORD') return 'ADVISORY';
  return 'DISPUTABLE';
}

/**
 * Called when the forensic engine finishes scoring a review.
 */
export async function onScoringComplete(params: {
  merchantId: string;
  investigationId: string;
  reviewerName: string;
  score: number;
  matchStatus: string;
}): Promise<void> {
  try {
    const [users, merchantName] = await Promise.all([
      getMerchantUsers(params.merchantId),
      getMerchantName(params.merchantId),
    ]);

    const consoleTier = computeConsoleTier(params.matchStatus, params.score);

    await Promise.all(
      users
        .filter((u) => u.prefs.onScoringComplete)
        .map((u) =>
          notifyScoringComplete({
            to: u.email,
            merchantName,
            reviewerName: params.reviewerName,
            score: params.score,
            matchStatus: params.matchStatus,
            consoleTier,
            investigationId: params.investigationId,
          }),
        ),
    );
  } catch (err) {
    console.error('[notify] onScoringComplete error:', err);
  }
}

/**
 * Called when a dispute PDF has been generated.
 */
export async function onPdfGenerated(params: {
  merchantId: string;
  investigationId: string;
  caseId: string;
}): Promise<void> {
  try {
    // Look up reviewer name
    const [review] = await db
      .select({ reviewerDisplayName: reviewsInvestigation.reviewerDisplayName })
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.id, params.investigationId))
      .limit(1);

    const [users, merchantName] = await Promise.all([
      getMerchantUsers(params.merchantId),
      getMerchantName(params.merchantId),
    ]);

    await Promise.all(
      users
        .filter((u) => u.prefs.onPdfReady)
        .map((u) =>
          notifyPdfReady({
            to: u.email,
            merchantName,
            reviewerName: review?.reviewerDisplayName ?? 'Unknown',
            caseId: params.caseId,
            investigationId: params.investigationId,
          }),
        ),
    );
  } catch (err) {
    console.error('[notify] onPdfGenerated error:', err);
  }
}

/**
 * Called when a POS sync completes with new transactions.
 */
export async function onPosSyncComplete(params: {
  merchantId: string;
  provider: string;
  transactionsInserted: number;
}): Promise<void> {
  try {
    const [users, merchantName] = await Promise.all([
      getMerchantUsers(params.merchantId),
      getMerchantName(params.merchantId),
    ]);

    await Promise.all(
      users
        .filter((u) => u.prefs.onPosSync)
        .map((u) =>
          notifyPosSyncComplete({
            to: u.email,
            merchantName,
            provider: params.provider,
            transactionsInserted: params.transactionsInserted,
          }),
        ),
    );
  } catch (err) {
    console.error('[notify] onPosSyncComplete error:', err);
  }
}
