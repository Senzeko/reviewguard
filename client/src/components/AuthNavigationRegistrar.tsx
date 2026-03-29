import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  registerAuthNavigate,
  resetUnauthorizedRedirectGuard,
} from '../auth/authNavigation';

/**
 * Registers React Router navigate for auth failures and resets 401 single-flight on /login.
 */
export function AuthNavigationRegistrar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    registerAuthNavigate(navigate);
    return () => registerAuthNavigate(null);
  }, [navigate]);

  useEffect(() => {
    if (pathname === '/login') {
      resetUnauthorizedRedirectGuard();
    }
  }, [pathname]);

  return null;
}
