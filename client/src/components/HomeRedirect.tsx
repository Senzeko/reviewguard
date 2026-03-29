import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * `/` → login, onboarding (no workspace yet), or shows.
 */
export function HomeRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text)' }}>
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.merchantId) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Navigate to="/dashboard" replace />;
}
