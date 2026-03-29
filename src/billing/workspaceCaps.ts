/**
 * Workspace caps by billing plan — shows and episodes (PodSignal), not ReviewGuard reviews.
 */

import { count, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { episodes, podcasts, subscriptions } from '../db/schema.js';

export function workspaceCapsForPlan(plan: string): { maxShows: number; maxEpisodes: number } {
  switch (plan) {
    case 'enterprise':
      return { maxShows: 100, maxEpisodes: 50_000 };
    case 'pro':
      return { maxShows: 15, maxEpisodes: 2_000 };
    case 'starter':
      return { maxShows: 5, maxEpisodes: 500 };
    default:
      return { maxShows: 2, maxEpisodes: 50 };
  }
}

export async function resolveWorkspacePlan(
  userId: string,
  merchantId: string | null,
): Promise<string> {
  if (merchantId) {
    const [s] = await db
      .select({ plan: subscriptions.plan })
      .from(subscriptions)
      .where(eq(subscriptions.merchantId, merchantId))
      .limit(1);
    if (s) return s.plan;
  }
  const [s2] = await db
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.ownerUserId, userId))
    .limit(1);
  return s2?.plan ?? 'free';
}

export async function countShowsForUser(userId: string): Promise<number> {
  const [r] = await db.select({ c: count() }).from(podcasts).where(eq(podcasts.ownerId, userId));
  return Number(r?.c ?? 0);
}

export async function countEpisodesForUser(userId: string): Promise<number> {
  const [r] = await db
    .select({ c: count() })
    .from(episodes)
    .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
    .where(eq(podcasts.ownerId, userId));
  return Number(r?.c ?? 0);
}
