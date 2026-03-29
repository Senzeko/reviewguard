import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_GET_RETRIES = 2;

/** User-visible copy when a request hits the axios timeout or transport abort. */
export const HTTP_TIMEOUT_USER_MESSAGE =
  'Request timed out. Check your connection and try again.';

export function isLikelyTimeoutError(err: Pick<AxiosError, 'code' | 'message'>): boolean {
  return err.code === 'ECONNABORTED' || /timeout/i.test(String(err.message));
}

type RetryConfig = InternalAxiosRequestConfig & { __retryCount?: number };

/**
 * Centralized timeout, GET-only retry (safe/idempotent), and clearer timeout errors.
 * Does not retry POST/PATCH/PUT/DELETE.
 */
export function applyHttpPolicy(api: AxiosInstance): void {
  api.defaults.timeout = DEFAULT_TIMEOUT_MS;

  api.interceptors.response.use(
    (res) => res,
    async (err: AxiosError) => {
      const cfg = err.config as RetryConfig | undefined;
      if (!cfg) return Promise.reject(err);

      if (err.code === 'ERR_CANCELED') return Promise.reject(err);

      const method = (cfg.method || 'get').toUpperCase();
      if (method !== 'GET') {
        return Promise.reject(annotateTimeout(err));
      }

      const status = err.response?.status;
      const retryable =
        err.response === undefined ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        status === 429;

      const count = cfg.__retryCount ?? 0;
      if (!retryable || count >= MAX_GET_RETRIES) {
        return Promise.reject(annotateTimeout(err));
      }

      cfg.__retryCount = count + 1;
      const delayMs = 400 * cfg.__retryCount;
      await new Promise((r) => setTimeout(r, delayMs));
      return api(cfg);
    },
  );
}

function annotateTimeout(err: AxiosError): AxiosError {
  if (isLikelyTimeoutError(err)) {
    err.message = HTTP_TIMEOUT_USER_MESSAGE;
  }
  return err;
}
