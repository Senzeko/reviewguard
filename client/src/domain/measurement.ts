/**
 * Client-side mirror of `src/podsignal/measurement.ts` claim rules (keep in sync).
 */
export const FORBIDDEN_CAUSAL_PATTERNS = [/caused/i, /proved/i, /exactly drove/i] as const;

export function containsForbiddenCausalClaim(text: string): boolean {
  return FORBIDDEN_CAUSAL_PATTERNS.some((re) => re.test(text));
}
