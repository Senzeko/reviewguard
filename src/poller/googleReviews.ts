/**
 * src/poller/googleReviews.ts
 *
 * Scheduled poller that fetches new Google reviews via the Places API
 * for all active merchants and their locations. Runs every 15 minutes
 * via the scheduler. Deduplicates against existing googleReviewId values.
 */

import axios from 'axios';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  merchants,
  merchantLocations,
  reviewsInvestigation,
} from '../db/schema.js';
import { env } from '../env.js';
import { broadcastSSE } from '../server/routes/sse.js';
import { onNewReview } from '../email/notify.js';

interface GoogleReview {
  reviewId: string;
  reviewer: { displayName: string };
  starRating: number;
  comment?: string;
  createTime: string;
}

interface PlaceReviewsResponse {
  reviews?: GoogleReview[];
}

/**
 * Fetch reviews for a single Google Place ID.
 * Uses the Places API v1 with field mask for reviews.
 */
async function fetchPlaceReviews(placeId: string): Promise<GoogleReview[]> {
  try {
    const resp = await axios.get<PlaceReviewsResponse>(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        headers: {
          'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': 'reviews',
        },
        timeout: 10_000,
      },
    );
    return resp.data.reviews ?? [];
  } catch (err) {
    console.error(`[poller] Failed to fetch reviews for ${placeId}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Process a batch of reviews for a merchant + placeId combination.
 * Inserts new reviews and skips duplicates.
 */
async function processReviews(
  merchantId: string,
  placeId: string,
  reviews: GoogleReview[],
): Promise<number> {
  let inserted = 0;

  for (const review of reviews) {
    // Star rating comes as enum string or number from Google
    const rating = typeof review.starRating === 'number'
      ? review.starRating
      : starRatingToNumber(review.starRating);

    if (!review.reviewId || rating === 0) continue;

    // Deduplicate
    const [existing] = await db
      .select({ id: reviewsInvestigation.id })
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.googleReviewId, review.reviewId))
      .limit(1);

    if (existing) continue;

    const [row] = await db
      .insert(reviewsInvestigation)
      .values({
        merchantId,
        googleReviewId: review.reviewId,
        reviewerDisplayName: review.reviewer?.displayName ?? 'Anonymous',
        reviewText: review.comment ?? '',
        reviewRating: rating,
        reviewPublishedAt: new Date(review.createTime),
        matchStatus: 'PENDING',
        auditLog: [
          {
            event: 'POLLER_INGESTED',
            actor: 'google_poller',
            ts: new Date().toISOString(),
            detail: `Polled from ${placeId} — rating: ${rating}`,
          },
        ],
      })
      .returning({ id: reviewsInvestigation.id });

    if (row) {
      inserted++;

      // SSE broadcast
      broadcastSSE(merchantId, 'review:new', {
        investigationId: row.id,
        reviewerName: review.reviewer?.displayName ?? 'Anonymous',
        rating,
        source: 'poller',
      });

      // Email notification (fire-and-forget)
      void onNewReview({
        merchantId,
        investigationId: row.id,
        reviewerName: review.reviewer?.displayName ?? 'Anonymous',
        rating,
        reviewText: review.comment ?? '',
      });
    }
  }

  return inserted;
}

/**
 * Convert Google's string-based star rating to a number.
 * Google API sometimes returns "FIVE", "FOUR", etc.
 */
function starRatingToNumber(rating: unknown): number {
  if (typeof rating === 'number') return rating;
  const map: Record<string, number> = {
    ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
  };
  return map[String(rating)] ?? 0;
}

/**
 * Main poll function — called by the scheduler every 15 minutes.
 * Iterates all active merchants and their locations.
 */
export async function pollGoogleReviews(): Promise<void> {
  console.log('[poller] Starting Google review poll...');
  let totalInserted = 0;

  try {
    // 1. Poll primary merchant placeIds
    const activeMerchants = await db
      .select({
        id: merchants.id,
        googlePlaceId: merchants.googlePlaceId,
      })
      .from(merchants)
      .where(eq(merchants.isActive, true));

    for (const merchant of activeMerchants) {
      const reviews = await fetchPlaceReviews(merchant.googlePlaceId);
      const count = await processReviews(merchant.id, merchant.googlePlaceId, reviews);
      totalInserted += count;
    }

    // 2. Poll additional locations
    const activeLocations = await db
      .select({
        merchantId: merchantLocations.merchantId,
        googlePlaceId: merchantLocations.googlePlaceId,
      })
      .from(merchantLocations)
      .where(eq(merchantLocations.isActive, true));

    for (const loc of activeLocations) {
      const reviews = await fetchPlaceReviews(loc.googlePlaceId);
      const count = await processReviews(loc.merchantId, loc.googlePlaceId, reviews);
      totalInserted += count;
    }

    console.log(`[poller] Poll complete — ${totalInserted} new reviews ingested`);
  } catch (err) {
    console.error('[poller] Poll error:', err);
  }
}
