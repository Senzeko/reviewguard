import { useState, useRef, type FormEvent } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getUserFacingApiError } from '../api/userFacingError';
import './Login.css';

const BAR_HEIGHTS_PCT = [47, 54, 50, 68, 61, 76, 72, 86, 82, 92, 99, 96];

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const submitLock = useRef(false);

  const fromState = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
  const returnToParam = searchParams.get('returnTo');
  const safeReturn =
    returnToParam &&
    returnToParam.startsWith('/') &&
    !returnToParam.startsWith('//') &&
    !returnToParam.includes('://')
      ? returnToParam
      : null;
  const postLoginPath = fromState
    ? `${fromState.pathname}${fromState.search ?? ''}`
    : safeReturn ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitLock.current || loading) return;
    submitLock.current = true;
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate(postLoginPath, { replace: true });
    } catch (err: unknown) {
      setError(getUserFacingApiError(err, 'Sign in failed'));
    } finally {
      setLoading(false);
      submitLock.current = false;
    }
  };

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="login-card">
          <div className="login-brand">
            <div className="login-logo" aria-hidden>
              <div className="login-logo-inner" />
            </div>
            <span className="login-brand-name">PodSignal</span>
          </div>

          <h1 className="login-h1">Welcome back</h1>
          <p className="login-lead">
            Sign in to manage your shows, launches, and sponsor reports
          </p>

          <form onSubmit={handleSubmit} noValidate>
            {error && <div className="login-error">{error}</div>}

            <div className="login-field">
              <label className="login-label" htmlFor="login-email">
                Email
              </label>
              <input
                id="login-email"
                className="login-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
              />
            </div>

            <div className="login-field">
              <label className="login-label" htmlFor="login-password">
                Password
              </label>
              <div className="login-input-wrap">
                <input
                  id="login-password"
                  className="login-input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Enter your password"
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  className="login-toggle-pw"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <img src="/figma-login/eye.svg" alt="" />
                </button>
              </div>
            </div>

            <div className="login-forgot-row">
              <Link className="login-forgot" to="/forgot-password">
                Need help signing in?
              </Link>
            </div>

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="login-footer">
            New to PodSignal?{' '}
            <Link className="signup-link" to="/signup">
              Sign up with email
            </Link>
          </p>
        </div>
      </div>

      <div className="login-right" aria-hidden>
        <div className="login-right-blur-a" />
        <div className="login-right-blur-b" />

        <div className="login-preview-wrap">
          <div className="login-preview-card">
            <div className="login-preview-head">
              <span className="login-preview-title">Launch Calendar</span>
              <span className="login-badge login-badge-purple">4 Active</span>
            </div>
            <div className="login-cal-grid">
              <div className="login-cal-item">
                <div className="login-cal-dot" style={{ background: '#5b4fe8' }} />
                <div className="login-cal-item-title">Ep 42: Growth Tactics</div>
                <div className="login-cal-item-date">Dec 18</div>
              </div>
              <div className="login-cal-item">
                <div className="login-cal-dot" style={{ background: '#f59e0b' }} />
                <div className="login-cal-item-title">Ep 43: Market Trends</div>
                <div className="login-cal-item-date">Dec 22</div>
              </div>
              <div className="login-cal-item">
                <div className="login-cal-dot" style={{ background: '#10b981' }} />
                <div className="login-cal-item-title">Ep 44: Team Building</div>
                <div className="login-cal-item-date">Dec 29</div>
              </div>
            </div>

            <div className="login-section">
              <div className="login-preview-head">
                <span className="login-preview-title">Downloads</span>
                <span className="login-badge login-badge-green">+24%</span>
              </div>
              <div className="login-bars">
                {BAR_HEIGHTS_PCT.map((h, i) => (
                  <div key={i} className="login-bar" style={{ height: `${h}%` }} />
                ))}
              </div>
              <div className="login-bar-labels">
                <span>Jan</span>
                <span>Dec</span>
              </div>
            </div>

            <div className="login-section">
              <div className="login-preview-head">
                <span className="login-preview-title">Sponsor Performance</span>
                <span style={{ fontSize: 13, color: '#6b6b6b' }}>Q4 2024</span>
              </div>
              <div className="login-sponsor-row">
                <div className="login-sponsor-left">
                  <div className="login-sponsor-icon" />
                  <span className="login-sponsor-name">TechCorp</span>
                </div>
                <div className="login-sponsor-right">
                  <span className="login-sponsor-metric">145K</span>
                  <span className="login-badge login-badge-green">4.2%</span>
                </div>
              </div>
              <div className="login-sponsor-row">
                <div className="login-sponsor-left">
                  <div className="login-sponsor-icon" />
                  <span className="login-sponsor-name">StartupKit</span>
                </div>
                <div className="login-sponsor-right">
                  <span className="login-sponsor-metric">98K</span>
                  <span className="login-badge login-badge-green">3.8%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="login-trust">Trusted by 2,000+ podcast teams</p>
      </div>
    </div>
  );
}
