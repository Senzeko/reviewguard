import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  fetchOnboardingState,
  updateOnboardingBusiness,
  updateOnboardingPos,
  updateOnboardingGoogle,
  finalizeOnboarding,
} from '../api/client';

const STEPS = ['Business', 'POS', 'Google', 'Review'];

export function Onboarding() {
  const { refetchUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Step 1
  const [businessName, setBusinessName] = useState('');
  // Step 2
  const [posProvider, setPosProvider] = useState<'SQUARE' | 'CLOVER'>('SQUARE');
  const [posApiKey, setPosApiKey] = useState('');
  const [cloverMerchantId, setCloverMerchantId] = useState('');
  // Step 3
  const [googlePlaceId, setGooglePlaceId] = useState('');
  // Step 4
  const [result, setResult] = useState<{
    merchantId: string;
    webhookSecret: string;
    webhookUrl: string;
  } | null>(null);

  useEffect(() => {
    fetchOnboardingState()
      .then((state) => {
        if (state.completedAt) {
          navigate('/dashboard');
          return;
        }
        setStep(state.currentStep);
        if (state.businessName) setBusinessName(state.businessName);
        if (state.posProvider) setPosProvider(state.posProvider as 'SQUARE' | 'CLOVER');
        if (state.googlePlaceId) setGooglePlaceId(state.googlePlaceId);
        if (state.cloverMerchantId) setCloverMerchantId(state.cloverMerchantId);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleStep1 = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await updateOnboardingBusiness(businessName);
      setStep(2);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed');
    }
  };

  const handleStep2 = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await updateOnboardingPos(posProvider, posApiKey, posProvider === 'CLOVER' ? cloverMerchantId : undefined);
      setStep(3);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed');
    }
  };

  const handleStep3 = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await updateOnboardingGoogle(googlePlaceId);
      setStep(4);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed');
    }
  };

  const handleFinalize = async () => {
    setError('');
    try {
      const res = await finalizeOnboarding();
      setResult(res);
      await refetchUser();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to finalize');
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading...</div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Set up your business</h1>

        {/* Step indicator */}
        <div style={styles.steps}>
          {STEPS.map((label, i) => (
            <div key={label} style={styles.stepRow}>
              <div
                style={{
                  ...styles.circle,
                  background: step > i + 1 ? '#1D9E75' : step === i + 1 ? '#1F4E79' : '#d1d1d1',
                  color: step >= i + 1 ? 'white' : '#888',
                }}
              >
                {step > i + 1 ? '\u2713' : i + 1}
              </div>
              <span style={{ fontSize: 13, color: step === i + 1 ? '#1F4E79' : '#888' }}>{label}</span>
              {i < 3 && <div style={styles.line} />}
            </div>
          ))}
        </div>

        {error && <div style={styles.error}>{error}</div>}

        {/* Step 1: Business name */}
        {step === 1 && (
          <form onSubmit={handleStep1} style={styles.form}>
            <label style={styles.label}>
              Business name
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
                style={styles.input}
                placeholder="Tony's Pizzeria"
              />
            </label>
            <button type="submit" style={styles.btn}>Next</button>
          </form>
        )}

        {/* Step 2: POS connection */}
        {step === 2 && (
          <form onSubmit={handleStep2} style={styles.form}>
            <label style={styles.label}>
              POS Provider
              <select
                value={posProvider}
                onChange={(e) => setPosProvider(e.target.value as 'SQUARE' | 'CLOVER')}
                style={styles.input}
              >
                <option value="SQUARE">Square</option>
                <option value="CLOVER">Clover</option>
              </select>
            </label>

            <label style={styles.label}>
              API Key / Access Token
              <input
                type="password"
                value={posApiKey}
                onChange={(e) => setPosApiKey(e.target.value)}
                required
                style={styles.input}
                placeholder={posProvider === 'SQUARE' ? 'Square access token' : 'Clover API key'}
              />
              <span style={styles.help}>
                {posProvider === 'SQUARE'
                  ? 'Find this in Square Developer Dashboard > OAuth > Access Token'
                  : 'Find this in Clover Developer Dashboard > API Tokens'}
              </span>
            </label>

            {posProvider === 'CLOVER' && (
              <label style={styles.label}>
                Clover Merchant ID
                <input
                  type="text"
                  value={cloverMerchantId}
                  onChange={(e) => setCloverMerchantId(e.target.value)}
                  required
                  style={styles.input}
                  placeholder="e.g. ABC123DEF456"
                />
              </label>
            )}

            <div style={styles.btnRow}>
              <button type="button" onClick={() => setStep(1)} style={styles.btnSecondary}>Back</button>
              <button type="submit" style={styles.btn}>Next</button>
            </div>
          </form>
        )}

        {/* Step 3: Google Place ID */}
        {step === 3 && (
          <form onSubmit={handleStep3} style={styles.form}>
            <label style={styles.label}>
              Google Place ID
              <input
                type="text"
                value={googlePlaceId}
                onChange={(e) => setGooglePlaceId(e.target.value)}
                required
                style={styles.input}
                placeholder="ChIJ..."
              />
              <span style={styles.help}>
                Find your Place ID at{' '}
                <a href="https://developers.google.com/maps/documentation/places/web-service/place-id" target="_blank" rel="noopener noreferrer" style={{ color: '#1F4E79' }}>
                  Google's Place ID Finder
                </a>
              </span>
            </label>

            <div style={styles.btnRow}>
              <button type="button" onClick={() => setStep(2)} style={styles.btnSecondary}>Back</button>
              <button type="submit" style={styles.btn}>Next</button>
            </div>
          </form>
        )}

        {/* Step 4: Review & Confirm */}
        {step === 4 && !result && (
          <div style={styles.form}>
            <h3 style={{ fontSize: 16, marginBottom: 12 }}>Review your setup</h3>
            <div style={styles.summary}>
              <div><strong>Business:</strong> {businessName}</div>
              <div><strong>POS:</strong> {posProvider}</div>
              <div><strong>Google Place ID:</strong> {googlePlaceId}</div>
              {posProvider === 'CLOVER' && <div><strong>Clover Merchant:</strong> {cloverMerchantId}</div>}
            </div>

            <div style={styles.btnRow}>
              <button type="button" onClick={() => setStep(3)} style={styles.btnSecondary}>Back</button>
              <button type="button" onClick={handleFinalize} style={styles.btn}>Complete Setup</button>
            </div>
          </div>
        )}

        {/* Success */}
        {result && (
          <div style={styles.form}>
            <div style={styles.success}>
              <h3>Setup complete!</h3>
              <p>Your business is now connected to ReviewGuard AI.</p>
            </div>

            <div style={styles.webhookInfo}>
              <h4 style={{ fontSize: 14, marginBottom: 8 }}>Webhook Configuration</h4>
              <p style={{ fontSize: 13, color: '#595959', marginBottom: 8 }}>
                To start monitoring reviews, configure your Google Business Profile to send
                review notifications to this endpoint:
              </p>
              <div style={styles.codeBlock}>
                <div><strong>URL:</strong> https://your-domain.com{result.webhookUrl}</div>
                <div><strong>Secret:</strong> {result.webhookSecret.slice(0, 16)}...</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              style={styles.btn}
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f5f4' },
  card: { background: 'white', borderRadius: 12, padding: 40, width: 480, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  title: { fontSize: 22, fontWeight: 700, color: '#1F4E79', marginBottom: 20 },
  steps: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  stepRow: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 },
  circle: { width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 },
  line: { width: '100%', height: 2, background: '#e0e0e0', marginTop: -18 },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, fontWeight: 500, color: '#444' },
  input: { padding: '10px 12px', border: '1px solid #d1d1d1', borderRadius: 8, fontSize: 14, outline: 'none' },
  help: { fontSize: 12, color: '#888', marginTop: 2 },
  btn: { padding: '12px', background: '#1F4E79', color: 'white', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  btnSecondary: { padding: '12px', background: 'white', color: '#444', border: '1px solid #d1d1d1', borderRadius: 8, fontSize: 15, cursor: 'pointer' },
  btnRow: { display: 'flex', gap: 12 },
  error: { background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, fontSize: 14, marginBottom: 8 },
  summary: { background: '#f8f8f7', padding: 16, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 },
  success: { background: '#f0fdf4', padding: 16, borderRadius: 8, color: '#166534', textAlign: 'center' },
  webhookInfo: { background: '#f8f8f7', padding: 16, borderRadius: 8 },
  codeBlock: { background: '#1a1a1a', color: '#4ade80', padding: 12, borderRadius: 6, fontSize: 12, fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: 4 },
};
