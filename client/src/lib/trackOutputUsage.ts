/**
 * Fire-and-forget output usage with optional session dedupe to reduce duplicate noise.
 */
import { postPodsignalOutputUsage } from '../api/client';

const PREFIX = 'podsignal_ou_';

function dedupeKey(parts: string[]): string {
  return `${PREFIX}${parts.join(':')}`;
}

/** Record output usage; swallows errors (analytics must not break UX). */
export async function trackOutputUsage(params: {
  eventType: string;
  episodeId?: string | null;
  payload?: Record<string, unknown>;
  /** If set, only one fire per browser session for this key. */
  dedupeSessionKey?: string;
}): Promise<void> {
  const { eventType, episodeId, payload, dedupeSessionKey } = params;
  if (dedupeSessionKey) {
    const k = dedupeKey([dedupeSessionKey]);
    try {
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, '1');
    } catch {
      /* private mode */
    }
  }
  try {
    await postPodsignalOutputUsage({ eventType, episodeId: episodeId ?? undefined, payload });
  } catch {
    /* ignore */
  }
}
