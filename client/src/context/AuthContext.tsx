import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { AuthUser } from '../types/auth';
import { api } from '../api/client';
import { resetUnauthorizedRedirectGuard } from '../auth/authNavigation';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get('/api/auth/me');
      setUser(data);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    fetchMe().finally(() => setLoading(false));
  }, [fetchMe]);

  const login = async (email: string, password: string) => {
    const { data } = await api.post<AuthUser>('/api/auth/login', { email, password });
    setUser(data);
    resetUnauthorizedRedirectGuard();
  };

  const signup = async (email: string, password: string, fullName: string) => {
    const { data } = await api.post<AuthUser>('/api/auth/signup', { email, password, fullName });
    setUser(data);
    resetUnauthorizedRedirectGuard();
  };

  const logout = async () => {
    await api.post('/api/auth/logout');
    setUser(null);
    resetUnauthorizedRedirectGuard();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refetchUser: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
