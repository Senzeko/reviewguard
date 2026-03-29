import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { getUserFacingApiError } from '../api/userFacingError';

interface BillingStatus {
  plan: string;
  status: string;
  reviewLimit: number;
  reviewsUsed: number;
  currentPeriodEnd: string | null;
  stripeConfigured: boolean;
  connect?: {
    accountId: string | null;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
  };
}

/** User-facing quota copy. API still uses reviewLimit/reviewsUsed until billing schema is renamed. */
const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: '/mo',
    quotaLabel: '25 episode processing credits/mo',
    features: ['1 show', 'Basic episode processing', 'Launch checklist', 'Email notifications'],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: '$49',
    period: '/mo',
    quotaLabel: '100 episode processing credits/mo',
    features: ['Everything in Free', 'Campaign board & export', 'Transcription (quota)', 'Team seats (3)'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$149',
    period: '/mo',
    quotaLabel: '500 episode processing credits/mo',
    features: ['Everything in Starter', 'Multi-show', 'Growth analytics', 'API access', 'Team seats (10)'],
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '$399',
    period: '/mo',
    quotaLabel: '5,000 episode processing credits/mo',
    features: ['Everything in Pro', 'Unlimited shows (fair use)', 'Dedicated support', 'Custom integrations'],
  },
];

function connectPillStyle(ok: boolean): React.CSSProperties {
  return {
    padding: '2px 8px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    background: ok ? '#E8F5E9' : '#FFF3E0',
    color: ok ? '#1D9E75' : '#BA7417',
  };
}

export function Billing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState('');
  const [connectLoading, setConnectLoading] = useState(false);
  const [returnBanner, setReturnBanner] = useState<'none' | 'pending' | 'success' | 'canceled'>('none');
  const [statusError, setStatusError] = useState('');
  const checkoutLockRef = useRef(false);
  const portalLockRef = useRef(false);
  const checkoutReturnPollStarted = useRef(false);

  const connectQuery = searchParams.get('connect');
  useEffect(() => {
    setStatusError('');
    api
      .get('/api/billing/status')
      .then((r) => setBilling(r.data))
      .catch((e) => setStatusError(getUserFacingApiError(e, 'Could not load billing status')));
  }, [connectQuery]);

  /** Stripe redirects here with ?checkout= — reconcile subscription after webhook delay. */
  useEffect(() => {
    const c = searchParams.get('checkout');
    if (!c) return;

    navigate('/billing', { replace: true });

    if (c === 'success') {
      if (checkoutReturnPollStarted.current) return;
      checkoutReturnPollStarted.current = true;
      setReturnBanner('pending');
      void (async () => {
        for (let i = 0; i < 8; i++) {
          try {
            const r = await api.get('/api/billing/status');
            setBilling(r.data);
          } catch {
            /* keep trying */
          }
          await new Promise((res) => setTimeout(res, 1000));
        }
        setReturnBanner('success');
      })();
    } else if (c === 'canceled') {
      setReturnBanner('canceled');
    }
  }, [searchParams, navigate]);

  async function handleCheckout(planId: string) {
    if (!billing?.stripeConfigured || checkoutLockRef.current) return;
    checkoutLockRef.current = true;
    setLoading(planId);
    let redirecting = false;
    try {
      const idempotencyKey = crypto.randomUUID();
      const { data } = await api.post<{ url: string | null }>('/api/billing/checkout', {
        plan: planId,
        idempotencyKey,
      });
      if (data.url) {
        redirecting = true;
        window.location.href = data.url;
        return;
      }
    } catch {
      /* surfaced below */
    } finally {
      if (!redirecting) {
        checkoutLockRef.current = false;
        setLoading('');
      }
    }
  }

  async function handlePortal() {
    if (portalLockRef.current) return;
    portalLockRef.current = true;
    let redirecting = false;
    try {
      const { data } = await api.post<{ url: string | null }>('/api/billing/portal');
      if (data.url) {
        redirecting = true;
        window.location.href = data.url;
        return;
      }
    } catch {
      /* */
    } finally {
      if (!redirecting) portalLockRef.current = false;
    }
  }

  /** Opens Stripe Connect onboarding; sends session cookie (must be logged in on this origin). */
  async function handleConnectOnboarding() {
    if (!billing?.stripeConfigured || connectLoading) return;
    setConnectLoading(true);
    let redirecting = false;
    try {
      const { data } = await api.post<{ url: string; accountId: string }>(
        '/api/billing/connect/account-link',
      );
      if (data.url) {
        redirecting = true;
        window.location.href = data.url;
        return;
      }
    } catch {
      /* */
    } finally {
      if (!redirecting) setConnectLoading(false);
    }
  }

  const usagePct = billing ? Math.min(100, Math.round((billing.reviewsUsed / billing.reviewLimit) * 100)) : 0;

  return (
    <div style={styles.page}>
      <section style={styles.heroCard}>
        <div>
          <h1 style={styles.title}>Billing & Plans</h1>
          <p style={styles.subtitle}>Plans, usage, and Stripe payout setup for your PodSignal workspace.</p>
        </div>
        <button onClick={() => navigate('/dashboard')} style={styles.backBtn}>Back to dashboard</button>
      </section>

      {statusError ? (
        <div
          role="alert"
          data-testid="billing-status-error"
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            padding: '12px 14px',
            borderRadius: 8,
            fontSize: 14,
          }}
        >
          {statusError}
        </div>
      ) : null}

      {returnBanner === 'pending' ? (
        <div style={styles.bannerPending} data-testid="billing-return-pending">
          <strong>Confirming checkout…</strong> Syncing your plan with Stripe (webhooks can take a few seconds).
        </div>
      ) : null}
      {returnBanner === 'success' ? (
        <div style={styles.bannerSuccess} data-testid="billing-return-success">
          <strong>Return from Stripe complete.</strong> Your plan below should reflect the subscription. If it
          still shows Free, refresh in a moment or check the Stripe dashboard.
          <button type="button" onClick={() => setReturnBanner('none')} style={styles.bannerDismiss}>
            Dismiss
          </button>
        </div>
      ) : null}
      {returnBanner === 'canceled' ? (
        <div style={styles.bannerCanceled} data-testid="billing-return-canceled">
          Checkout was canceled — no charge was made.
          <button type="button" onClick={() => setReturnBanner('none')} style={styles.bannerDismiss}>
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Current Plan Summary */}
      {billing && (
        <div style={styles.currentPlan}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: '#111827' }}>
                {billing.plan.charAt(0).toUpperCase() + billing.plan.slice(1)} Plan
              </h2>
              <span style={{
                padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                background: billing.status === 'active' ? '#E8F5E9' : '#FFF3E0',
                color: billing.status === 'active' ? '#1D9E75' : '#BA7417',
              }}>
                {billing.status}
              </span>
            </div>

            {/* Usage bar */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#888', marginBottom: 4 }}>
                <span>Usage this period</span>
                <span>{billing.reviewsUsed} / {billing.reviewLimit}</span>
              </div>
              <div style={{ height: 8, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4, transition: 'width 0.3s',
                  width: `${usagePct}%`,
                  background: usagePct >= 90 ? '#E24B4A' : usagePct >= 70 ? '#BA7417' : '#1D9E75',
                }} />
              </div>
            </div>

            {billing.currentPeriodEnd ? (
              <p style={{ fontSize: 13, color: '#888', margin: 0 }}>
                Current period ends: {new Date(billing.currentPeriodEnd).toLocaleDateString()}
              </p>
            ) : null}
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '8px 0 0' }}>
              {billing.currentPeriodEnd
                ? 'Episode processing credits reset when your paid billing period renews (Stripe).'
                : 'Episode processing credits reset at the start of each UTC calendar month on the free plan.'}
            </p>
          </div>

          {billing.plan !== 'free' && billing.stripeConfigured && (
            <button onClick={() => void handlePortal()} style={styles.portalBtn}>
              Manage Subscription
            </button>
          )}
        </div>
      )}

      {billing?.stripeConfigured && (
        <div style={styles.connectCard}>
          <h2 style={{ margin: '0 0 8px', fontSize: 18, color: '#1F4E79' }}>Stripe Connect (payouts)</h2>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#666' }}>
            Link a Stripe Express account to receive payouts. Uses your logged-in session — open this page at{' '}
            <strong>http://localhost:5173</strong> after signing in (not the API port alone).
          </p>
          {billing.connect && (
            <div style={{ fontSize: 13, color: '#555', marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <span style={connectPillStyle(billing.connect.chargesEnabled)}>Charges {billing.connect.chargesEnabled ? 'on' : 'off'}</span>
              <span style={connectPillStyle(billing.connect.payoutsEnabled)}>Payouts {billing.connect.payoutsEnabled ? 'on' : 'off'}</span>
              <span style={connectPillStyle(billing.connect.detailsSubmitted)}>Details {billing.connect.detailsSubmitted ? 'submitted' : 'pending'}</span>
              {billing.connect.accountId && (
                <span style={{ fontSize: 12, color: '#888' }}>Account {billing.connect.accountId}</span>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => void handleConnectOnboarding()}
            disabled={connectLoading}
            style={styles.connectBtn}
          >
            {connectLoading ? 'Opening Stripe…' : 'Continue Connect onboarding'}
          </button>
        </div>
      )}

      {/* Plan Cards */}
      <div style={styles.planGrid}>
        {PLANS.map(plan => {
          const isCurrent = billing?.plan === plan.id;
          return (
            <div key={plan.id} style={{
              ...styles.planCard,
              ...(plan.popular ? styles.planPopular : {}),
              ...(isCurrent ? styles.planCurrent : {}),
            }}>
              {plan.popular && <div style={styles.popularBadge}>Most Popular</div>}
              <h3 style={{ margin: '0 0 4px', fontSize: 18, color: '#333' }}>{plan.name}</h3>
              <div style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 32, fontWeight: 700, color: '#1F4E79' }}>{plan.price}</span>
                <span style={{ fontSize: 14, color: '#888' }}>{plan.period}</span>
              </div>
              <p style={{ fontSize: 13, color: '#1D9E75', fontWeight: 600, marginBottom: 16 }}>{plan.quotaLabel}</p>
              <ul style={{ listStyle: 'none', padding: 0, marginBottom: 20, flex: 1 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ fontSize: 13, color: '#555', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#1D9E75' }}>{'\u2713'}</span> {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <button disabled style={styles.currentBtn}>Current Plan</button>
              ) : plan.id === 'free' ? (
                <div />
              ) : (
                <button
                  type="button"
                  data-testid={plan.id !== 'free' ? `billing-upgrade-${plan.id}` : undefined}
                  onClick={() => void handleCheckout(plan.id)}
                  disabled={!billing?.stripeConfigured || loading === plan.id}
                  style={plan.popular ? styles.upgradeBtnPrimary : styles.upgradeBtn}
                >
                  {loading === plan.id ? 'Redirecting...' : billing?.stripeConfigured ? 'Upgrade' : 'Stripe Not Configured'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!billing?.stripeConfigured && (
        <p style={{ textAlign: 'center', color: '#888', fontSize: 13, marginTop: 16 }}>
          Stripe is not configured. Set STRIPE_SECRET_KEY and price IDs in your environment to enable billing.
        </p>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { display: 'grid', gap: 14 },
  heroCard: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 20,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  title: { fontSize: 34, lineHeight: 1.1, margin: 0, color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280', margin: '8px 0 0' },
  backBtn: { padding: '8px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12, cursor: 'pointer', color: '#4b5563', fontWeight: 600 },
  bannerPending: {
    background: '#fffbeb',
    border: '1px solid #fde68a',
    color: '#92400e',
    padding: '12px 14px',
    borderRadius: 8,
    fontSize: 14,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerSuccess: {
    background: '#ecfdf5',
    border: '1px solid #6ee7b7',
    color: '#065f46',
    padding: '12px 14px',
    borderRadius: 8,
    fontSize: 14,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerCanceled: {
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    color: '#4b5563',
    padding: '12px 14px',
    borderRadius: 8,
    fontSize: 14,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerDismiss: {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid currentColor',
    background: '#fff',
    cursor: 'pointer',
    fontSize: 12,
  },
  currentPlan: { background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 24 },
  portalBtn: { padding: '10px 14px', background: '#fff', border: '1px solid #6d28d9', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#6d28d9', fontWeight: 600, whiteSpace: 'nowrap' },
  connectCard: {
    background: '#fff',
    borderRadius: 12,
    padding: 20,
    border: '1px solid #e5e7eb',
  },
  connectBtn: {
    padding: '10px 14px',
    background: '#6d28d9',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    color: 'white',
  },
  planGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 },
  planCard: { background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', position: 'relative' },
  planPopular: { border: '2px solid #6d28d9' },
  planCurrent: { background: '#f8fbff' },
  popularBadge: { position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#6d28d9', color: 'white', padding: '4px 14px', borderRadius: 12, fontSize: 11, fontWeight: 600 },
  upgradeBtn: { padding: '10px 14px', background: '#fff', border: '1px solid #6d28d9', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#6d28d9', textAlign: 'center' },
  upgradeBtnPrimary: { padding: '10px 14px', background: '#6d28d9', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'white', textAlign: 'center' },
  currentBtn: { padding: '10px 20px', background: '#f0f0f0', border: 'none', borderRadius: 8, fontSize: 14, color: '#888', textAlign: 'center' },
};
