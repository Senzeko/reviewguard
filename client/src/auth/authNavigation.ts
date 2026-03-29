import type { NavigateFunction } from 'react-router-dom';

/**
 * SPA-safe 401 handling: use React Router (preserves in-memory state vs full reload).
 * Single-flight guard prevents parallel 401s from stacking redirects.
 */
let navigateFn: NavigateFunction | null = null;
let redirectInFlight = false;

export function registerAuthNavigate(fn: NavigateFunction | null): void {
  navigateFn = fn;
}

export function resetUnauthorizedRedirectGuard(): void {
  redirectInFlight = false;
}

function buildReturnLocation(): { pathname: string; search: string } {
  if (typeof window === 'undefined') {
    return { pathname: '/', search: '' };
  }
  return { pathname: window.location.pathname, search: window.location.search };
}

/**
 * Call from axios 401 interceptor. Navigates to /login with return location in router state.
 */
export function navigateToLoginAfterUnauthorized(): void {
  if (redirectInFlight) return;
  redirectInFlight = true;

  const from = buildReturnLocation();

  if (navigateFn) {
    navigateFn('/login', {
      replace: true,
      state: { from },
    });
    return;
  }

  // SSR or before BrowserRouter mounts — preserve intent via query string
  const returnTo = `${from.pathname}${from.search}`;
  const qs = new URLSearchParams({ returnTo });
  window.location.assign(`/login?${qs.toString()}`);
}
