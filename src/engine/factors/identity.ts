/**
 * src/engine/factors/identity.ts
 *
 * Jaro-Winkler fuzzy name matching implementation + identity factor scoring.
 * Pure functions — no DB calls, no side effects.
 */

import type { IdentityFactorResult } from '../types.js';

// ── Name preprocessing ─────────────────────────────────────────────────────────

function preprocessName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Remove common honorifics
    .replace(/^(mr\.?|mrs\.?|ms\.?|dr\.?|prof\.?)\s+/i, '')
    // Remove trailing punctuation like "Michael T." → keep the T
    .replace(/[.,]+$/, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ');
}

// ── Jaro distance ──────────────────────────────────────────────────────────────

function jaroDistance(s1: string, s2: string): number {
  if (s1.length === 0 && s2.length === 0) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;
  if (s1 === s2) return 1.0;

  const matchWindow = Math.max(
    Math.floor(Math.max(s1.length, s2.length) / 2) - 1,
    0,
  );

  const s1Matches = new Array<boolean>(s1.length).fill(false);
  const s2Matches = new Array<boolean>(s2.length).fill(false);

  let matches = 0;

  // Find matching characters
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  // Count transpositions
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / s1.length +
      matches / s2.length +
      (matches - transpositions / 2) / matches) /
    3
  );
}

// ── Jaro-Winkler distance ──────────────────────────────────────────────────────

/**
 * Jaro-Winkler distance between two strings.
 * Returns a value between 0.0 (no similarity) and 1.0 (identical).
 *
 * Both strings are preprocessed (lowercase, trim, remove honorifics) before
 * comparison.
 */
export function jaroWinkler(raw1: string, raw2: string): number {
  const s1 = preprocessName(raw1);
  const s2 = preprocessName(raw2);

  if (s1.length === 0 && s2.length === 0) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;
  if (s1 === s2) return 1.0;

  const dj = jaroDistance(s1, s2);

  // Common prefix length (up to 4)
  let l = 0;
  const maxPrefix = Math.min(4, Math.min(s1.length, s2.length));
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) {
      l++;
    } else {
      break;
    }
  }

  const p = 0.1; // Winkler scaling factor
  return dj + l * p * (1 - dj);
}

// ── Identity factor scoring ────────────────────────────────────────────────────

export function computeIdentityScore(
  reviewerName: string,
  customerName: string | null,
): IdentityFactorResult {
  // If name_plain_temp has expired (customerName is null):
  if (customerName === null) {
    return {
      score: 0.0,
      level: 'NO_DATA',
      detail:
        'Identity match unavailable \u2014 plaintext name window has expired (>14 days)',
      jaro_winkler_score: 0.0,
      reviewer_name: reviewerName,
      customer_name: null,
      name_window_expired: true,
    };
  }

  const dw = jaroWinkler(reviewerName, customerName);

  let score: number;
  let level: IdentityFactorResult['level'];
  let detail: string;

  if (dw >= 0.92) {
    score = 1.0;
    level = 'HIGH';
    detail = `Name match: "${reviewerName}" \u2194 "${customerName}" (Jaro-Winkler: ${dw.toFixed(2)})`;
  } else if (dw >= 0.80) {
    score = 0.6;
    level = 'MEDIUM';
    detail = `Partial name match: "${reviewerName}" \u2194 "${customerName}" (Jaro-Winkler: ${dw.toFixed(2)})`;
  } else if (dw >= 0.70) {
    score = 0.3;
    level = 'LOW';
    detail = `Weak name match: "${reviewerName}" \u2194 "${customerName}" (Jaro-Winkler: ${dw.toFixed(2)})`;
  } else {
    score = 0.0;
    level = 'NONE';
    detail = `No name match: "${reviewerName}" \u2194 "${customerName}" (Jaro-Winkler: ${dw.toFixed(2)})`;
  }

  return {
    score,
    level,
    detail,
    jaro_winkler_score: dw,
    reviewer_name: reviewerName,
    customer_name: customerName,
    name_window_expired: false,
  };
}
