import axios from 'axios';

/** Vite/nginx often return 502 when the upstream API is down or unreachable. */
export const API_UNAVAILABLE_MESSAGE =
  'Cannot reach the API server. Start the backend (e.g. npm run dev on port 3000) or use npm run dev:all so the Vite proxy can reach the API.';

function bodyError(data: unknown): string | undefined {
  if (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string') {
    return (data as { error: string }).error;
  }
  return undefined;
}

/**
 * Prefer server `error` when present; map proxy/gateway and network failures to actionable copy.
 */
export function getUserFacingApiError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    if (status === 502 || status === 503 || status === 504) {
      return bodyError(err.response?.data) ?? API_UNAVAILABLE_MESSAGE;
    }
    if (!err.response) {
      const code = err.code;
      if (code === 'ERR_NETWORK' || code === 'ECONNREFUSED' || err.message === 'Network Error') {
        return API_UNAVAILABLE_MESSAGE;
      }
    }
    const body = bodyError(err.response?.data);
    return body ?? err.message ?? fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
