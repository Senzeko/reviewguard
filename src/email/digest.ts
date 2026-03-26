/**
 * src/email/digest.ts
 *
 * Daily digest — gathers last 24h of review activity per merchant
 * and sends a summary email to users who opted in.
 */

import { eq, and, gte, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  merchants,
  merchantUsers,
  reviewsInvestigation,
} from '../db/schema.js';
import { notifyDailyDigest } from './service.js';

interface NotifPrefs {
  dailyDigest: boolean;
  [key: string]: boolean;
}

export async function sendDailyDigests(): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let sent = 0;

  try {
    // Get all active merchants
    const activeMerchants = await db
      .select({ id: merchants.id, businessName: merchants.businessName })
      .from(merchants)
      .where(eq(merchants.isActive, true));

    for (const merchant of activeMerchants) {
      // Get users who opted into daily digest
      const users = await db
        .select({
          email: merchantUsers.email,
          notificationPrefs: merchantUsers.notificationPrefs,
        })
        .from(merchantUsers)
        .where(
          and(
            eq(merchantUsers.merchantId, merchant.id),
            eq(merchantUsers.isActive, true),
          ),
        );

      const digestUsers = users.filter((u) => {
        const prefs = u.notificationPrefs as NotifPrefs | null;
        return prefs?.dailyDigest ?? false;
      });

      if (digestUsers.length === 0) continue;

      // Count reviews from last 24h
      const reviews = await db
        .select({
          matchStatus: reviewsInvestigation.matchStatus,
          confidenceScore: reviewsInvestigation.confidenceScore,
          createdAt: reviewsInvestigation.createdAt,
          updatedAt: reviewsInvestigation.updatedAt,
        })
        .from(reviewsInvestigation)
        .where(
          and(
            eq(reviewsInvestigation.merchantId, merchant.id),
            gte(reviewsInvestigation.createdAt, since),
          ),
        );

      // Also count reviews scored in last 24h (may have been created earlier)
      const scored = await db
        .select({
          matchStatus: reviewsInvestigation.matchStatus,
          confidenceScore: reviewsInvestigation.confidenceScore,
        })
        .from(reviewsInvestigation)
        .where(
          and(
            eq(reviewsInvestigation.merchantId, merchant.id),
            gte(reviewsInvestigation.updatedAt, since),
            sql`${reviewsInvestigation.matchStatus} NOT IN ('PENDING', 'PROCESSING')`,
          ),
        );

      const newReviews = reviews.length;
      const scoredCount = scored.length;

      let disputable = 0;
      let advisory = 0;
      let legitimate = 0;

      for (const r of scored) {
        const score = r.confidenceScore ?? 0;
        if (score >= 75 && r.matchStatus === 'VERIFIED') {
          legitimate++;
        } else if (score >= 50 && r.matchStatus !== 'NO_RECORD') {
          advisory++;
        } else {
          disputable++;
        }
      }

      // Send digest to each opted-in user
      for (const user of digestUsers) {
        await notifyDailyDigest({
          to: user.email,
          merchantName: merchant.businessName,
          newReviews,
          scored: scoredCount,
          disputable,
          advisory,
          legitimate,
        });
        sent++;
      }
    }
  } catch (err) {
    console.error('[digest] Daily digest error:', err);
  }

  console.log(`[digest] Sent ${sent} daily digest emails`);
  return sent;
}
