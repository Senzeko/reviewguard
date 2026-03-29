import { Link } from 'react-router-dom';
import { AuthPodSignalBrand } from '../components/AuthPodSignalBrand';
import '../components/AuthPodSignal.css';

/**
 * Closed beta: password reset email flow is not wired to the API yet.
 * Keep this route so bookmarks don’t 404; surface honest help instead of a broken form.
 */
export function ForgotPassword() {
  return (
    <div className="auth-ps">
      <div className="auth-ps-card">
        <AuthPodSignalBrand />
        <h1 className="auth-ps-title">Sign-in help</h1>
        <p className="auth-ps-desc">
          Automated password reset isn&apos;t available in this build. If you can&apos;t sign in, contact your PodSignal host
          or use the email and password you registered with.
        </p>
        <Link to="/login" className="auth-ps-btn" style={{ textAlign: 'center', textDecoration: 'none', display: 'block' }}>
          Back to sign in
        </Link>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Link to="/signup" className="auth-ps-link">
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}
