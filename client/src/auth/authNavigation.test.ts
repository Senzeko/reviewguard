import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerAuthNavigate,
  resetUnauthorizedRedirectGuard,
  navigateToLoginAfterUnauthorized,
} from './authNavigation';

describe('navigateToLoginAfterUnauthorized', () => {
  beforeEach(() => {
    resetUnauthorizedRedirectGuard();
    registerAuthNavigate(null);
    vi.stubGlobal('window', {
      location: {
        pathname: '/dashboard',
        search: '',
      },
    });
  });

  it('dedupes parallel calls when React Router navigate is registered', () => {
    const nav = vi.fn();
    registerAuthNavigate(nav as Parameters<typeof registerAuthNavigate>[0]);

    navigateToLoginAfterUnauthorized();
    navigateToLoginAfterUnauthorized();
    navigateToLoginAfterUnauthorized();

    expect(nav).toHaveBeenCalledTimes(1);
    expect(nav).toHaveBeenCalledWith('/login', {
      replace: true,
      state: {
        from: {
          pathname: '/dashboard',
          search: '',
        },
      },
    });
  });

  it('allows a second navigation after guard reset', () => {
    const nav = vi.fn();
    registerAuthNavigate(nav as Parameters<typeof registerAuthNavigate>[0]);

    navigateToLoginAfterUnauthorized();
    resetUnauthorizedRedirectGuard();
    navigateToLoginAfterUnauthorized();

    expect(nav).toHaveBeenCalledTimes(2);
  });
});
