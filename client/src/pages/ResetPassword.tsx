import { Link } from 'react-router-dom';
import { AuthPodSignalBrand } from '../components/AuthPodSignalBrand';
import '../components/AuthPodSignal.css';

/**
 * Closed beta: token-based reset is not implemented server-side.
 */
export function ResetPassword() {
  return (
    <div className="auth-ps">
      <div className="auth-ps-card">
        <AuthPodSignalBrand />
        <h1 className="auth-ps-title">Password reset</h1>
        <p className="auth-ps-desc">
          Email reset links aren&apos;t active in this build. Use sign in with your current password, or contact your
          PodSignal host if you need access restored.
        </p>
        <Link to="/login" className="auth-ps-btn" style={{ textAlign: 'center', textDecoration: 'none', display: 'block' }}>
          Back to sign in
        </Link>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Link to="/forgot-password" className="auth-ps-link">
            Sign-in help
          </Link>
        </div>
      </div>
    </div>
  );
}
