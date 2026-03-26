/**
 * src/engine/factors/identity.ts
 *
 * Jaro-Winkler fuzzy name matching implementation + identity factor scoring.
 * Pure functions — no DB calls, no side effects.
 */
import type { IdentityFactorResult } from '../types.js';
/**
 * Jaro-Winkler distance between two strings.
 * Returns a value between 0.0 (no similarity) and 1.0 (identical).
 *
 * Both strings are preprocessed (lowercase, trim, remove honorifics) before
 * comparison.
 */
export declare function jaroWinkler(raw1: string, raw2: string): number;
export declare function computeIdentityScore(reviewerName: string, customerName: string | null): IdentityFactorResult;
//# sourceMappingURL=identity.d.ts.map