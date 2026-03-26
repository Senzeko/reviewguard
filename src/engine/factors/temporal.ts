/**
 * src/engine/factors/temporal.ts
 *
 * Temporal decay curve scoring.
 * Pure function — no DB calls, no side effects.
 */

import type { TemporalFactorResult } from '../types.js';

/**
 * Computes the temporal factor score based on the time delta between
 * review publication and transaction close.
 *
 * Decay curve:
 *   deltaHours <= 24          -> score: 1.0, level: 'HIGH'
 *   deltaHours <= 168 (7d)    -> score: 0.6, level: 'MEDIUM'
 *   deltaHours <= 336 (14d)   -> score: 0.3, level: 'LOW'
 *   deltaHours >  336         -> score: 0.0, level: 'NONE'
 */
export function computeTemporalScore(
  reviewPublishedAt: Date,
  transactionClosedAt: Date,
): TemporalFactorResult {
  const deltaMs = Math.abs(
    reviewPublishedAt.getTime() - transactionClosedAt.getTime(),
  );
  const deltaHours = deltaMs / (1000 * 60 * 60);

  let score: number;
  let level: TemporalFactorResult['level'];
  let detail: string;

  if (deltaHours <= 24) {
    score = 1.0;
    level = 'HIGH';
    detail = `Review posted ${deltaHours.toFixed(1)} hours after transaction close (high-confidence window \u226424h)`;
  } else if (deltaHours <= 168) {
    score = 0.6;
    level = 'MEDIUM';
    detail = `Review posted ${deltaHours.toFixed(1)} hours after transaction close (medium-confidence window \u22647d)`;
  } else if (deltaHours <= 336) {
    score = 0.3;
    level = 'LOW';
    const deltaDays = deltaHours / 24;
    detail = `Review posted ${deltaDays.toFixed(1)} days after transaction close (low-confidence window \u226414d)`;
  } else {
    score = 0.0;
    level = 'NONE';
    const deltaDays = deltaHours / 24;
    detail = `Review posted ${deltaDays.toFixed(1)} days after transaction close \u2014 outside 14-day match window`;
  }

  return {
    score,
    level,
    detail,
    delta_hours: deltaHours,
    review_published_at: reviewPublishedAt.toISOString(),
    transaction_closed_at: transactionClosedAt.toISOString(),
  };
}
