import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchOnboardingState, finalizePodsignalOnboarding } from '../api/client';
import { loadDraft, removeDraft, saveDraft } from '../lib/draftStorage';
import { AuthPodSignalBrand } from '../components/AuthPodSignalBrand';
import '../components/AuthPodSignal.css';

const SIGNUP_WORKSPACE_KEY = 'podsignal_workspace_name';

export function Onboarding() {
  const { refetchUser } = useAuth();
  const navigate = useNavigate();
  const [workspaceName, setWorkspaceName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [draftRestored, setDraftRestored] = useState(false);
  const submitLockRef = useRef(false);

  useEffect(() => {
    fetchOnboardingState()
      .then((state) => {
        if (state.completedAt) {
          navigate('/dashboard', { replace: true });
          return;
        }
        if (state.businessName) {
          setWorkspaceName(state.businessName);
          return;
        }
        const d = loadDraft<{ workspaceName: string }>('onboarding_workspace');
        if (d?.value.workspaceName?.trim()) {
          setWorkspaceName(d.value.workspaceName);
          setDraftRestored(true);
          return;
        }
        try {
          const fromSignup = sessionStorage.getItem(SIGNUP_WORKSPACE_KEY)?.trim();
          if (fromSignup) {
            setWorkspaceName(fromSignup);
            setDraftRestored(true);
          }
        } catch {
          /* private mode */
        }
      })
      .catch(() => {
        /* offline or unexpected — still allow submit if user types a name */
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const n = workspaceName.trim();
      if (n.length >= 2) saveDraft('onboarding_workspace', { workspaceName: n });
    }, 400);
    return () => window.clearTimeout(t);
  }, [workspaceName]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const name = workspaceName.trim();
    if (name.length < 2) {
      setError('Enter at least 2 characters');
      return;
    }
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setSaving(true);
    setError('');
    try {
      await finalizePodsignalOnboarding({ workspaceName: name });
      removeDraft('onboarding_workspace');
      try {
        sessionStorage.removeItem(SIGNUP_WORKSPACE_KEY);
      } catch {
        /* */
      }
      await refetchUser();
      navigate('/shows', { replace: true });
    } catch (err: unknown) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? 'Could not finish setup. Try again.');
    } finally {
      setSaving(false);
      submitLockRef.current = false;
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={{ color: 'var(--ps-muted)', fontSize: 15 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <AuthPodSignalBrand variant="inline" />
        <h1 style={styles.title}>Almost there</h1>
        <p style={styles.lead}>
          Name your show or network. You&apos;ll add episodes and launch assets next — nothing here connects to reviews or
          POS; it&apos;s just your label in PodSignal.
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          {error ? <div style={styles.error}>{error}</div> : null}
          {draftRestored ? (
            <div style={styles.hintBanner}>
              We pulled in a name from sign-up or your saved draft. You can edit it before continuing.
              <button type="button" onClick={() => setDraftRestored(false)} style={styles.hintDismiss}>
                Dismiss
              </button>
            </div>
          ) : null}

          <label style={styles.label}>
            Show or workspace name
            <input
              type="text"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              required
              minLength={2}
              autoFocus
              style={styles.input}
              placeholder="e.g. The Morning Brief"
            />
          </label>

          <p style={styles.microcopy}>Closed beta: your host can help if anything looks wrong.</p>

          <button type="submit" disabled={saving} style={styles.btn}>
            {saving ? 'Saving…' : 'Continue to shows'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: 'var(--ps-bg)',
    fontFamily: 'var(--font-sans, Inter, system-ui, sans-serif)',
  },
  card: {
    background: 'var(--ps-surface)',
    borderRadius: 12,
    padding: 40,
    width: '100%',
    maxWidth: 440,
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    border: '1px solid var(--ps-border)',
  },
  title: { fontSize: 22, fontWeight: 700, color: 'var(--ps-text)', marginBottom: 12, marginTop: 16 },
  lead: { fontSize: 15, color: 'var(--ps-muted)', lineHeight: 1.55, marginBottom: 22 },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 600, color: 'var(--ps-text)' },
  input: {
    padding: '10px 12px',
    border: '1px solid var(--ps-border)',
    borderRadius: 8,
    fontSize: 15,
    outline: 'none',
  },
  btn: {
    padding: '12px',
    background: 'var(--ps-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 4,
  },
  error: {
    background: '#fef2f2',
    color: '#b91c1c',
    padding: '10px 14px',
    borderRadius: 8,
    fontSize: 14,
  },
  hintBanner: {
    background: '#ecfdf5',
    border: '1px solid #6ee7b7',
    color: '#065f46',
    padding: '10px 12px',
    borderRadius: 8,
    fontSize: 13,
    lineHeight: 1.45,
  },
  hintDismiss: {
    marginLeft: 10,
    padding: '2px 8px',
    fontSize: 12,
    cursor: 'pointer',
    borderRadius: 6,
    border: '1px solid #059669',
    background: '#fff',
  },
  microcopy: { fontSize: 12, color: 'var(--ps-muted)', margin: 0, lineHeight: 1.4 },
};
