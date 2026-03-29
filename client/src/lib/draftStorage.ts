/**
 * Session-scoped draft persistence for interrupted auth flows.
 * Uses sessionStorage (tab-scoped); entries expire after TTL.
 */

const PREFIX = 'podsignal_draft_v1_';
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function saveDraft(key: string, value: unknown): void {
  try {
    const payload = JSON.stringify({ savedAt: Date.now(), value });
    sessionStorage.setItem(PREFIX + key, payload);
  } catch {
    // Quota or private mode
  }
}

export function loadDraft<T>(
  key: string,
  maxAgeMs = DEFAULT_TTL_MS,
): { value: T; savedAt: number } | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; value?: T };
    if (typeof parsed.savedAt !== 'number' || parsed.value === undefined) return null;
    if (Date.now() - parsed.savedAt > maxAgeMs) {
      removeDraft(key);
      return null;
    }
    return { value: parsed.value, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function removeDraft(key: string): void {
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}
