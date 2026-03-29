/** Shared SSE reconnect backoff (matches useSseConnection / useEpisodeLiveUpdates). */

const BASE_BACKOFF_MS = 1200;
const MAX_BACKOFF_MS = 30_000;

export function sseReconnectDelayMs(attempt: number): number {
  if (attempt < 1) return BASE_BACKOFF_MS;
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (attempt - 1));
}
