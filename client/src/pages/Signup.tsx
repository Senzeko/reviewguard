import { useState, useRef, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getUserFacingApiError } from '../api/userFacingError';
import { AuthPodSignalBrand } from '../components/AuthPodSignalBrand';
import '../components/AuthPodSignal.css';

export function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submitLockRef = useRef(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (submitLockRef.current || loading) return;
    submitLockRef.current = true;
    setLoading(true);
    try {
      if (workspaceName.trim()) {
        try {
          sessionStorage.setItem('podsignal_workspace_name', workspaceName.trim());
        } catch {
          /* ignore */
        }
      }
      await signup(email, password, fullName);
      navigate('/onboarding');
    } catch (err: unknown) {
      setError(getUserFacingApiError(err, 'Could not create account'));
    } finally {
      setLoading(false);
      submitLockRef.current = false;
    }
  };

  return (
    <div className="auth-ps-split">
      <div className="auth-ps-split-left">
        <AuthPodSignalBrand variant="inline" />
        <h1 className="auth-ps-split-title" style={{ marginTop: 20 }}>
          Join PodSignal
        </h1>
        <p className="auth-ps-split-sub">Closed beta — launch episodes with clear, observed metrics.</p>
        <span className="auth-ps-badge">Podcaster access</span>

        <p className="auth-ps-split-sub" style={{ marginTop: 16, marginBottom: 8 }}>
          Use the email you want for sign-in. You&apos;ll name your show on the next step.
        </p>

        <form onSubmit={handleSubmit}>
          {error ? <div className="auth-ps-error">{error}</div> : null}

          <label className="auth-ps-label" htmlFor="su-name">
            Full name
          </label>
          <input
            id="su-name"
            className="auth-ps-input"
            style={{ marginBottom: 14 }}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoComplete="name"
            placeholder="Enter your full name"
          />

          <label className="auth-ps-label" htmlFor="su-email">
            Work email
          </label>
          <input
            id="su-email"
            className="auth-ps-input"
            style={{ marginBottom: 14 }}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@company.com"
          />

          <label className="auth-ps-label" htmlFor="su-pw">
            Password
          </label>
          <div className="auth-ps-input-wrap">
            <input
              id="su-pw"
              type={showPw ? 'text' : 'password'}
              className="auth-ps-input"
              style={{ paddingRight: 40, marginBottom: 0 }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Create a password (8+ characters)"
            />
            <button
              type="button"
              className="auth-ps-toggle-eye"
              onClick={() => setShowPw(!showPw)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '6px 0 14px' }}>Must be at least 8 characters</p>

          <label className="auth-ps-label" htmlFor="su-ws">
            Show name <span style={{ fontWeight: 400, color: '#6b7280' }}>(optional)</span>
          </label>
          <input
            id="su-ws"
            className="auth-ps-input"
            style={{ marginBottom: 18 }}
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="Saves time on the next screen"
          />

          <button type="submit" className="auth-ps-btn" disabled={loading}>
            {loading ? 'Creating…' : 'Create account'}
          </button>
        </form>

        <p className="auth-ps-footer" style={{ marginTop: 16 }}>
          By signing up, you agree to our{' '}
          <a href="/terms" style={{ color: '#2563eb' }}>
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="/privacy" style={{ color: '#2563eb' }}>
            Privacy Policy
          </a>
        </p>
        <p className="auth-ps-footer">
          Already have an account?{' '}
          <Link to="/login" style={{ color: '#2563eb', fontWeight: 600 }}>
            Sign in
          </Link>
        </p>
      </div>

      <div className="auth-ps-split-right">
        <h2 className="auth-ps-split-title">Built for podcast launches</h2>
        <p className="auth-ps-split-sub">One place for assets, trackable links, and honest launch proof.</p>

        {[
          { t: 'Episode → launch workflow', d: 'Titles, clips, copy, and approvals in one thread.' },
          { t: 'Trackable short links', d: 'Observed clicks on your PodSignal links — not host vanity metrics.' },
          { t: 'Launch proof you can share', d: 'Export what happened in-product, labeled by evidence type.' },
          { t: 'No retail POS setup', d: 'This beta path skips old review / POS onboarding entirely.' },
        ].map((f, i) => (
          <div key={f.t} className="auth-ps-feature">
            <div className="auth-ps-feature-icon">{i + 1}</div>
            <div>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </div>
          </div>
        ))}

        <div className="auth-ps-trust">
          <span>✓ Closed beta</span>
          <span>✓ Email sign-in</span>
          <span>✓ Founder-supported</span>
        </div>
      </div>
    </div>
  );
}
