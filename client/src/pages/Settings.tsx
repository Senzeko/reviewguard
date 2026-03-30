import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './SettingsPodSignal.css';
import {
  fetchPosStatus,
  triggerPosSync,
  fetchWebhookConfig,
  fetchNotificationPreferences,
  updateNotificationPreferences,
  fetchAccountInfo,
  changePassword,
  fetchTeamMembers,
  inviteTeamMember,
  removeTeamMember,
  type PosStatus,
  type WebhookConfig,
  type NotificationPreferences,
  type AccountInfo,
  type TeamMember,
} from '../api/client';

type Tab = 'pos' | 'webhook' | 'notifications' | 'team' | 'account';
const SHOW_LEGACY_SETTINGS = import.meta.env.VITE_SHOW_LEGACY_SETTINGS === 'true';

export function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('pos');

  // Show OAuth success/error banner
  const posConnected = searchParams.get('pos_connected');
  const posError = searchParams.get('pos_error');

  useEffect(() => {
    if (!SHOW_LEGACY_SETTINGS && tab === 'webhook') {
      setTab('pos');
    }
  }, [tab]);

  const tabs: [Tab, string][] = [
    ['pos', 'Data Sources'],
    ...(SHOW_LEGACY_SETTINGS ? ([['webhook', 'Legacy Integrations']] as [Tab, string][]) : []),
    ['notifications', 'Notifications'],
    ['team', 'Team'],
    ['account', 'Account'],
  ];

  return (
    <div className="ps-settings-shell">
      <div className="ps-settings-breadcrumb">
        PodSignal / <strong>Settings</strong>
      </div>
      <header className="ps-settings-header">
        <div>
          <h1 className="ps-settings-title">Settings</h1>
          <span className="ps-settings-meta">{user?.merchant?.businessName ?? 'PodSignal workspace'}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="button" onClick={() => navigate('/dashboard')} className="ps-settings-btn-ghost">
            ← Dashboard
          </button>
          <button type="button" onClick={() => void logout().then(() => navigate('/login'))} className="ps-settings-btn-ghost">
            Sign out
          </button>
        </div>
      </header>

      {posConnected && (
        <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 8, padding: 16, marginBottom: 16, fontSize: 14 }}>
          <strong>Data source connected.</strong> Your {posConnected} account has been linked and an initial sync was queued.
        </div>
      )}
      {posError && (
        <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 8, padding: 16, marginBottom: 16, fontSize: 14 }}>
          <strong>Connection failed:</strong> {posError}
        </div>
      )}

      <div className="ps-settings-tabs">
        {tabs.map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={tab === t ? 'ps-settings-tab ps-settings-tab--active' : 'ps-settings-tab'}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="ps-settings-panel">
        {tab === 'pos' && <PosTab />}
        {SHOW_LEGACY_SETTINGS && tab === 'webhook' && <WebhookTab />}
        {tab === 'notifications' && <NotificationsTab />}
        {tab === 'team' && <TeamTab />}
        {tab === 'account' && <AccountTab />}
      </div>
    </div>
  );
}

// ── POS Tab ──────────────────────────────────────────────────────────────────

function PosTab() {
  const [pos, setPos] = useState<PosStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  useEffect(() => { fetchPosStatus().then(setPos).catch(() => {}); }, []);

  const handleSync = async () => {
    setSyncing(true); setSyncMsg('');
    try {
      await triggerPosSync();
      setSyncMsg('Sync job queued! Transactions will be imported in the background.');
      setTimeout(() => { fetchPosStatus().then(setPos).catch(() => {}); }, 3000);
    } catch (err: any) {
      setSyncMsg(err.response?.data?.error ?? 'Sync failed');
    } finally { setSyncing(false); }
  };

  if (!pos) return <p style={{ color: '#888' }}>Loading data source status...</p>;

  return (
    <div>
      <h3 style={styles.sectionTitle}>Commerce data source</h3>
      <div style={styles.card}>
        <Row label="Provider"><span style={styles.badge}>{pos.posProvider}</span></Row>
        <Row label="Status">
          <span style={{ color: pos.isActive ? '#1D9E75' : '#E24B4A', fontWeight: 600 }}>
            {pos.isActive ? 'Connected' : 'Disconnected'}
          </span>
        </Row>
        <Row label="Credentials">{pos.hasApiKey ? 'Configured (encrypted)' : 'Not set'}</Row>
        {pos.cloverMerchantId && <Row label="Clover Merchant ID"><code style={styles.code}>{pos.cloverMerchantId}</code></Row>}
        <Row label="Last Sync">{pos.lastSyncAt ? new Date(pos.lastSyncAt).toLocaleString() : 'Never synced'}</Row>
      </div>
      <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button onClick={handleSync} disabled={syncing || !pos.isActive}
          style={{ ...styles.primaryBtn, opacity: syncing || !pos.isActive ? 0.5 : 1 }}>
          {syncing ? 'Syncing...' : 'Pull latest transactions'}
        </button>
        {!pos.isActive && <span style={{ fontSize: 13, color: '#E24B4A' }}>This source is disconnected. Reconnect to keep launch evidence data fresh.</span>}
      </div>
      {syncMsg && <p style={{ marginTop: 12, fontSize: 14, color: syncMsg.includes('queued') ? '#1D9E75' : '#E24B4A' }}>{syncMsg}</p>}
      <div style={{ marginTop: 32 }}>
        <h4 style={styles.subTitle}>How this supports PodSignal</h4>
        <ul style={styles.helpList}>
          <li>Transactions sync automatically every <strong>6 hours</strong>.</li>
          <li>Each sync imports the last <strong>14 days</strong> of completed orders.</li>
          <li>This data helps with attribution and sponsor-proof context inside PodSignal.</li>
          <li>Credentials are encrypted with AES-256-GCM.</li>
        </ul>
      </div>
    </div>
  );
}

// ── Webhook Tab ──────────────────────────────────────────────────────────────

function WebhookTab() {
  const [webhook, setWebhook] = useState<WebhookConfig | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => { fetchWebhookConfig().then(setWebhook).catch(() => {}); }, []);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(label); setTimeout(() => setCopied(''), 2000); });
  };

  if (!webhook) return <p style={{ color: '#888' }}>Loading integration config...</p>;

  return (
    <div>
      <h3 style={styles.sectionTitle}>Legacy ReviewGuard integration</h3>
      <p style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
        This webhook is from the earlier ReviewGuard workflow. It is optional and not required for PodSignal podcast launch operations.
      </p>
      <div style={styles.card}>
        <Row label="Webhook URL">
          <code style={styles.code}>{webhook.webhookUrl}</code>
          <button onClick={() => copy(webhook.webhookUrl, 'url')} style={styles.copyBtn}>{copied === 'url' ? 'Copied!' : 'Copy'}</button>
        </Row>
        <Row label="HMAC Secret">
          <code style={styles.code}>{showSecret ? webhook.webhookSecret : '\u2022'.repeat(32)}</code>
          <button onClick={() => setShowSecret(!showSecret)} style={styles.copyBtn}>{showSecret ? 'Hide' : 'Show'}</button>
          <button onClick={() => copy(webhook.webhookSecret, 'secret')} style={styles.copyBtn}>{copied === 'secret' ? 'Copied!' : 'Copy'}</button>
        </Row>
        <Row label="Google Place ID">
          <code style={styles.code}>{webhook.googlePlaceId}</code>
          <button onClick={() => copy(webhook.googlePlaceId, 'place')} style={styles.copyBtn}>{copied === 'place' ? 'Copied!' : 'Copy'}</button>
        </Row>
      </div>
      <div style={{ marginTop: 24 }}>
        <h4 style={styles.subTitle}>If you still use this legacy flow</h4>
        <ol style={styles.helpList}>
          <li>Go to your Google Business Profile settings</li>
          <li>Navigate to <strong>Notifications &rarr; Webhooks</strong></li>
          <li>Add a new webhook with the URL and HMAC secret above</li>
          <li>Set the event type to <strong>REVIEW_PUBLISH</strong></li>
          <li>Save and test with a sample payload</li>
        </ol>
      </div>
    </div>
  );
}

// ── Notifications Tab ────────────────────────────────────────────────────────

function NotificationsTab() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchNotificationPreferences().then(setPrefs).catch(() => {}); }, []);

  const toggle = async (key: keyof NotificationPreferences['preferences']) => {
    if (!prefs) return;
    setSaving(true);
    const newVal = !prefs.preferences[key];
    try {
      const result = await updateNotificationPreferences({ [key]: newVal });
      setPrefs({ ...prefs, preferences: result.preferences });
    } catch { /* ignore */ }
    setSaving(false);
  };

  if (!prefs) return <p style={{ color: '#888' }}>Loading notification preferences...</p>;

  const notifItems = [
    { key: 'onNewReview' as const, label: 'New feedback signal', desc: 'Notify when a new external feedback signal is detected (legacy-compatible).' },
    { key: 'onScoringComplete' as const, label: 'Episode processing complete', desc: 'Notify when transcript and analysis jobs finish.' },
    { key: 'onPdfReady' as const, label: 'Launch proof export ready', desc: 'Notify when a sponsor-proof PDF is generated.' },
    { key: 'onPosSync' as const, label: 'Data source sync complete', desc: 'Notify when transactions and source data imports finish.' },
    { key: 'dailyDigest' as const, label: 'Daily workspace digest', desc: 'Receive a daily summary of launch activity and key events.' },
  ];

  return (
    <div>
      <h3 style={styles.sectionTitle}>Workspace notifications</h3>
      {!prefs.emailConfigured && (
        <div style={{ background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: 8, padding: 16, marginBottom: 20, fontSize: 14 }}>
          <strong>SMTP not configured.</strong> Email notifications are logged to the server console in development mode. Set <code>SMTP_HOST</code>, <code>SMTP_USER</code>, and <code>SMTP_PASS</code> to enable email delivery.
        </div>
      )}
      <div style={styles.card}>
        {notifItems.map(({ key, label, desc }) => (
          <div key={key} style={{ ...styles.row, justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => toggle(key)}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>{label}</div>
              <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{desc}</div>
            </div>
            <div style={{
              width: 44, height: 24, borderRadius: 12,
              background: prefs.preferences[key] ? '#1D9E75' : '#ccc',
              position: 'relative', transition: 'background 0.2s',
              opacity: saving ? 0.5 : 1,
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: 10, background: 'white',
                position: 'absolute', top: 2,
                left: prefs.preferences[key] ? 22 : 2,
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Team Tab ─────────────────────────────────────────────────────────────────

function TeamTab() {
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteResult, setInviteResult] = useState<{ tempPassword: string; email: string } | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    fetchTeamMembers().then((r) => setMembers(r.members)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleInvite = async () => {
    setError('');
    if (!inviteEmail || !inviteName) { setError('Email and name are required'); return; }
    try {
      const result = await inviteTeamMember(inviteEmail, inviteName);
      setInviteResult({ tempPassword: result.tempPassword, email: result.email });
      setInviteEmail(''); setInviteName('');
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to invite');
    }
  };

  const handleRemove = async (userId: string, name: string) => {
    if (!confirm(`Deactivate ${name}? They will lose access to the dashboard.`)) return;
    try {
      await removeTeamMember(userId);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to remove');
    }
  };

  const isOwner = members.find((m) => m.id === user?.userId)?.role === 'owner';

  return (
    <div>
      <h3 style={styles.sectionTitle}>Workspace team</h3>

      {loading ? <p style={{ color: '#888' }}>Loading...</p> : (
        <div style={styles.card}>
          {members.map((m) => (
            <div key={m.id} style={{ ...styles.row, justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: m.isActive ? '#333' : '#aaa' }}>
                  {m.fullName} {!m.isActive && <span style={{ fontSize: 11, color: '#E24B4A' }}>(deactivated)</span>}
                </div>
                <div style={{ fontSize: 13, color: '#888' }}>{m.email} &middot; <span style={styles.badge}>{m.role}</span></div>
              </div>
              {isOwner && m.id !== user?.userId && m.isActive && (
                <button onClick={() => handleRemove(m.id, m.fullName)} style={styles.dangerBtn}>Remove</button>
              )}
            </div>
          ))}
        </div>
      )}

      {isOwner && (
        <div style={{ marginTop: 24 }}>
          {!showInvite ? (
            <button onClick={() => setShowInvite(true)} style={styles.primaryBtn}>Invite teammate</button>
          ) : (
            <div style={{ ...styles.card, marginTop: 12 }}>
              <h4 style={styles.subTitle}>Invite teammate</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400 }}>
                <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Full name"
                  style={styles.input} />
                <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Email address" type="email"
                  style={styles.input} />
                {error && <p style={{ color: '#E24B4A', fontSize: 13, margin: 0 }}>{error}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleInvite} style={styles.primaryBtn}>Send Invite</button>
                  <button onClick={() => { setShowInvite(false); setInviteResult(null); }} style={styles.logoutBtn}>Cancel</button>
                </div>
              </div>
              {inviteResult && (
                <div style={{ marginTop: 16, background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 8, padding: 16 }}>
                  <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>Team member created!</p>
                  <p style={{ margin: '0 0 4px', fontSize: 13 }}>Email: <strong>{inviteResult.email}</strong></p>
                  <p style={{ margin: '0 0 4px', fontSize: 13 }}>Temporary password: <code style={styles.code}>{inviteResult.tempPassword}</code></p>
                  <p style={{ margin: 0, fontSize: 12, color: '#666' }}>Share this password securely. They should change it after first login.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Account Tab ──────────────────────────────────────────────────────────────

function AccountTab() {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [showPwForm, setShowPwForm] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');

  useEffect(() => { fetchAccountInfo().then(setAccount).catch(() => {}); }, []);

  const handleChangePassword = async () => {
    setPwError(''); setPwMsg('');
    if (!currentPw || !newPw) { setPwError('All fields are required'); return; }
    if (newPw.length < 8) { setPwError('New password must be at least 8 characters'); return; }
    if (newPw !== confirmPw) { setPwError('New passwords do not match'); return; }
    try {
      await changePassword(currentPw, newPw);
      setPwMsg('Password changed successfully');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setShowPwForm(false);
    } catch (err: any) {
      setPwError(err.response?.data?.error ?? 'Failed to change password');
    }
  };

  if (!account) return <p style={{ color: '#888' }}>Loading account info...</p>;

  return (
    <div>
      <h3 style={styles.sectionTitle}>Profile & security</h3>
      <div style={styles.card}>
        <Row label="Full Name">{account.fullName}</Row>
        <Row label="Email">{account.email}</Row>
        <Row label="Role"><span style={styles.badge}>{account.role}</span></Row>
        <Row label="Account Created">{new Date(account.createdAt).toLocaleDateString()}</Row>
      </div>

      <div style={{ marginTop: 24 }}>
        {pwMsg && <p style={{ color: '#1D9E75', fontSize: 14 }}>{pwMsg}</p>}
        {!showPwForm ? (
          <button onClick={() => setShowPwForm(true)} style={styles.primaryBtn}>Change Password</button>
        ) : (
          <div style={{ ...styles.card, maxWidth: 400 }}>
            <h4 style={styles.subTitle}>Change Password</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)}
                placeholder="Current password" style={styles.input} />
              <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
                placeholder="New password (min 8 characters)" style={styles.input} />
              <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Confirm new password" style={styles.input} />
              {pwError && <p style={{ color: '#E24B4A', fontSize: 13, margin: 0 }}>{pwError}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleChangePassword} style={styles.primaryBtn}>Update Password</button>
                <button onClick={() => setShowPwForm(false)} style={styles.logoutBtn}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared Components ────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.row}>
      <span style={styles.label}>{label}</span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, color: '#333' }}>{children}</div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: '24px 16px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #e0e0e0' },
  title: { fontSize: 22, fontWeight: 700, color: '#1F4E79', margin: 0 },
  meta: { fontSize: 13, color: '#888' },
  backBtn: { padding: '8px 16px', background: 'white', border: '1px solid #1F4E79', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#1F4E79', fontWeight: 600 },
  logoutBtn: { padding: '8px 16px', background: 'white', border: '1px solid #d1d1d1', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#444' },
  tabs: { display: 'flex', gap: 4, marginBottom: 24, flexWrap: 'wrap' as any },
  tab: { padding: '10px 20px', background: 'white', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 14, cursor: 'pointer', color: '#444', fontWeight: 500 },
  tabActive: { background: '#1F4E79', color: 'white', borderColor: '#1F4E79' },
  content: { background: 'white', borderRadius: 12, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  sectionTitle: { fontSize: 18, fontWeight: 700, color: '#111827', marginTop: 0, marginBottom: 16 },
  subTitle: { fontSize: 15, fontWeight: 600, color: '#333', marginBottom: 12, marginTop: 0 },
  card: { background: '#f8f9fa', borderRadius: 8, padding: 20 },
  row: { display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: '1px solid #eee' },
  label: { fontSize: 14, color: '#888', minWidth: 160, flexShrink: 0 },
  code: { fontSize: 13, fontFamily: 'monospace', background: '#e9ecef', padding: '4px 8px', borderRadius: 4, wordBreak: 'break-all' as any },
  copyBtn: { padding: '4px 10px', background: 'white', border: '1px solid #d1d1d1', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#4f46e5', fontWeight: 600, flexShrink: 0 },
  badge: { display: 'inline-block', padding: '2px 10px', background: '#6366f1', color: 'white', borderRadius: 12, fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const },
  primaryBtn: { padding: '10px 24px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  dangerBtn: { padding: '6px 14px', background: 'white', border: '1px solid #E24B4A', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#E24B4A', fontWeight: 600 },
  input: { padding: '10px 14px', border: '1px solid #d1d1d1', borderRadius: 8, fontSize: 14, outline: 'none' },
  helpList: { fontSize: 14, color: '#555', lineHeight: 1.8, paddingLeft: 20 },
};
