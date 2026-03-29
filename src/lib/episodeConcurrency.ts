/**
 * Optimistic concurrency for episode PATCH using If-Unmodified-Since semantics.
 * Conflict when the row was modified on the server after the client's baseline time.
 */

const DEFAULT_TOLERANCE_MS = 1000;

/**
 * Returns true if the server row is newer than the client's baseline (stale write).
 * When `clientIso` is omitted, no check applies (legacy / internal callers).
 */
export function isStaleVersusIfUnmodifiedSince(
  clientIso: string | undefined,
  serverUpdatedAt: Date,
  toleranceMs = DEFAULT_TOLERANCE_MS,
): boolean {
  if (clientIso === undefined) return false;
  const clientMs = Date.parse(clientIso);
  if (Number.isNaN(clientMs)) return true;
  const serverMs = serverUpdatedAt.getTime();
  return serverMs > clientMs + toleranceMs;
}
