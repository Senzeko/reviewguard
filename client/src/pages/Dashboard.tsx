import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchDashboardStats, fetchDashboardInvestigations } from '../api/client';
import type { DashboardStats, InvestigationSummary } from '../types/auth';

const STATUS_TABS = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Verified', value: 'VERIFIED' },
  { label: 'Mismatch', value: 'MISMATCH' },
  { label: 'No Record', value: 'NO_RECORD' },
];

const TIER_COLORS: Record<string, string> = {
  DISPUTABLE: '#E24B4A',
  ADVISORY: '#BA7417',
  LEGITIMATE: '#1D9E75',
  NOT_READY: '#888',
};

const TIER_LABELS: Record<string, string> = {
  DISPUTABLE: 'Disputable',
  ADVISORY: 'Advisory',
  LEGITIMATE: 'Verified Customer',
  NOT_READY: 'Scoring...',
};

function StarRating({ rating }: { rating: number }) {
  return <span style={{ color: rating <= 2 ? '#E24B4A' : rating <= 3 ? '#BA7417' : '#1D9E75' }}>
    {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
  </span>;
}

export function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [items, setItems] = useState<InvestigationSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [sseStatus, setSseStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const refreshRef = useRef<() => void>(undefined);

  const refreshData = useCallback(() => {
    fetchDashboardStats().then(setStats).catch(() => {});
    fetchDashboardInvestigations({ status: statusFilter || undefined, page, limit: 15 })
      .then((res) => { setItems(res.items); setTotal(res.total); })
      .catch(() => {});
  }, [statusFilter, page]);

  refreshRef.current = refreshData;

  // SSE connection for real-time updates
  useEffect(() => {
    const es = new EventSource('/api/sse/events', { withCredentials: true });

    es.addEventListener('connected', () => setSseStatus('connected'));
    es.addEventListener('review:new', () => refreshRef.current?.());
    es.addEventListener('review:scored', () => refreshRef.current?.());
    es.addEventListener('review:confirmed', () => refreshRef.current?.());
    es.addEventListener('pdf:ready', () => refreshRef.current?.());
    es.addEventListener('sync:complete', () => refreshRef.current?.());

    es.onerror = () => setSseStatus('disconnected');

    return () => { es.close(); };
  }, []);

  useEffect(() => {
    fetchDashboardStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchDashboardInvestigations({ status: statusFilter || undefined, page, limit: 15 })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, statusFilter]);

  const totalPages = Math.ceil(total / 15);

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.bizName}>{user?.merchant?.businessName ?? 'ReviewGuard AI'}</h1>
          <span style={styles.meta}>
            {user?.merchant?.posProvider} &middot;{' '}
            {user?.merchant?.lastSyncAt
              ? `Last sync: ${new Date(user.merchant.lastSyncAt).toLocaleDateString()}`
              : 'No sync yet'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: sseStatus === 'connected' ? '#1D9E75' : sseStatus === 'connecting' ? '#BA7417' : '#E24B4A',
          }} title={`Live: ${sseStatus}`} />
          <span style={{ fontSize: 13, color: '#888' }}>{user?.email}</span>
          <button onClick={() => navigate('/analytics')} style={styles.navBtn}>Analytics</button>
          <button onClick={() => navigate('/locations')} style={styles.navBtn}>Locations</button>
          <button onClick={() => navigate('/billing')} style={styles.navBtn}>Billing</button>
          <button onClick={() => navigate('/settings')} style={styles.settingsBtn}>Settings</button>
          <button onClick={() => void logout().then(() => navigate('/login'))} style={styles.logoutBtn}>Sign out</button>
        </div>
      </header>

      {/* Stats */}
      {stats && (
        <div style={styles.statsRow}>
          <StatCard label="Total Reviews" value={stats.total} color="#1F4E79" />
          <StatCard label="Awaiting Score" value={stats.pending} color="#BA7417" />
          <StatCard label="Action Needed" value={stats.noRecord + stats.mismatch} color="#E24B4A" />
          <StatCard label="Real Customers" value={stats.verified} color="#1D9E75" />
        </div>
      )}

      {/* Filter tabs */}
      <div style={styles.tabs}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setStatusFilter(tab.value); setPage(1); }}
            style={{
              ...styles.tab,
              ...(statusFilter === tab.value ? styles.tabActive : {}),
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Reviewer</th>
              <th style={styles.th}>Rating</th>
              <th style={styles.th}>Date</th>
              <th style={styles.th}>Score</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Tier</th>
              <th style={styles.th}>Reviewed</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#888' }}>No investigations yet</td></tr>
            ) : (
              items.map((inv) => (
                <tr
                  key={inv.id}
                  style={styles.row}
                  onClick={() => navigate(`/console/${inv.id}`)}
                >
                  <td style={styles.td}>{inv.reviewerDisplayName}</td>
                  <td style={styles.td}><StarRating rating={inv.reviewRating} /></td>
                  <td style={styles.td}>{new Date(inv.reviewPublishedAt).toLocaleDateString()}</td>
                  <td style={styles.td}>{inv.confidenceScore ?? '-'}</td>
                  <td style={styles.td}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{inv.matchStatus}</span>
                  </td>
                  <td style={styles.td}>
                    <span style={{
                      ...styles.tierBadge,
                      background: TIER_COLORS[inv.consoleTier] ?? '#888',
                    }}>
                      {TIER_LABELS[inv.consoleTier] ?? inv.consoleTier}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {inv.humanReviewedAt ? '\u2713' : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={styles.pagination}>
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} style={styles.pageBtn}>Prev</button>
          <span style={{ fontSize: 14, color: '#888' }}>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} style={styles.pageBtn}>Next</button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={styles.statCard}>
      <span style={{ fontSize: 13, color: '#888' }}>{label}</span>
      <span style={{ fontSize: 28, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '24px 16px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #e0e0e0' },
  bizName: { fontSize: 22, fontWeight: 700, color: '#1F4E79' },
  meta: { fontSize: 13, color: '#888' },
  navBtn: { padding: '8px 12px', background: 'white', border: '1px solid #d1d1d1', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#444' },
  settingsBtn: { padding: '8px 16px', background: 'white', border: '1px solid #1F4E79', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#1F4E79', fontWeight: 600 },
  logoutBtn: { padding: '8px 16px', background: 'white', border: '1px solid #d1d1d1', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#444' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 },
  statCard: { background: 'white', padding: 20, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 4 },
  tabs: { display: 'flex', gap: 4, marginBottom: 16 },
  tab: { padding: '8px 16px', background: 'white', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#444' },
  tabActive: { background: '#1F4E79', color: 'white', borderColor: '#1F4E79' },
  tableWrap: { background: 'white', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#888', borderBottom: '1px solid #e0e0e0', textTransform: 'uppercase' },
  td: { padding: '14px 16px', fontSize: 14, borderBottom: '1px solid #f0f0f0' },
  row: { cursor: 'pointer', transition: 'background 0.15s' },
  tierBadge: { display: 'inline-block', padding: '3px 10px', borderRadius: 12, color: 'white', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 20 },
  pageBtn: { padding: '8px 16px', background: 'white', border: '1px solid #d1d1d1', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
};
