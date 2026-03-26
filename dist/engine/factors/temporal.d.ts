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
export declare function computeTemporalScore(reviewPublishedAt: Date, transactionClosedAt: Date): TemporalFactorResult;
//# sourceMappingURL=temporal.d.ts.map