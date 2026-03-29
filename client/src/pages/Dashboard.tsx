/**
 * ReviewGuard investigations dashboard (legacy console). Not mounted in App.tsx — production /dashboard
 * uses DashboardPage.tsx. Keep this file for future wiring or ReviewGuard-only deployments.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchDashboardStats, fetchDashboardInvestigations } from '../api/client';
import type { DashboardStats, InvestigationSummary } from '../types/auth';
import { useSseConnection } from '../hooks/useSseConnection';

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
  return (
    <span style={{ color: rating <= 2 ? '#ef4444' : rating <= 3 ? '#d97706' : '#16a34a' }}>
      {'★'.repeat(rating)}
      {'☆'.repeat(5 - rating)}
    </span>
  );
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
  const refreshRef = useRef<() => void>(undefined);

  const refreshData = useCallback(() => {
    fetchDashboardStats().then(setStats).catch(() => {});
    fetchDashboardInvestigations({ status: statusFilter || undefined, page, limit: 15 })
      .then((res) => { setItems(res.items); setTotal(res.total); })
      .catch(() => {});
  }, [statusFilter, page]);

  refreshRef.current = refreshData;

  const sseHandlersRef = useRef<Record<string, () => void>>({});
  sseHandlersRef.current = {
    'review:new': () => refreshRef.current?.(),
    'review:scored': () => refreshRef.current?.(),
    'review:confirmed': () => refreshRef.current?.(),
    'pdf:ready': () => refreshRef.current?.(),
    'sync:complete': () => refreshRef.current?.(),
  };

  const { liveStatus } = useSseConnection({
    enabled: true,
    handlersRef: sseHandlersRef,
    reconnectDeps: [],
  });

  const sseLabel =
    liveStatus === 'live' ? 'Live' : liveStatus === 'connecting' ? 'Connecting' : 'Offline';

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
  const avgConfidence =
    items.length > 0
      ? Math.round(
          items.reduce((acc, item) => acc + (item.confidenceScore ?? 0), 0) /
            Math.max(
              1,
              items.reduce((acc, item) => acc + (item.confidenceScore == null ? 0 : 1), 0),
            ),
        )
      : 0;

  const needsAttention = (stats?.noRecord ?? 0) + (stats?.mismatch ?? 0);

  return (
    <div style={styles.page}>
      <section style={styles.heroCard}>
        <div>
          <h1 style={styles.pageTitle}>Launch Campaigns</h1>
          <p style={styles.pageSubtitle}>
            Monitor campaign readiness and review matching signals across all locations.
          </p>
        </div>
        <div style={styles.heroActions}>
          <button onClick={() => navigate('/analytics')} style={styles.softBtn}>
            Analytics
          </button>
          <button onClick={() => navigate('/locations')} style={styles.softBtn}>
            Locations
          </button>
          <button onClick={() => navigate('/settings')} style={styles.softBtn}>
            Settings
          </button>
          <button onClick={() => navigate('/billing')} style={styles.primaryBtn}>
            Billing
          </button>
          <button onClick={() => void logout().then(() => navigate('/login'))} style={styles.softBtn}>
            Sign out
          </button>
        </div>
      </section>

      {stats ? (
        <section style={styles.statsRow}>
          <StatCard label="Total Reviews" value={stats.total} color="#4f46e5" />
          <StatCard label="Awaiting Score" value={stats.pending} color="#ef4444" />
          <StatCard label="Avg Confidence" value={avgConfidence} suffix="%" color="#059669" />
          <StatCard label="Verified" value={stats.verified} color="#2563eb" />
          <StatCard label="Needs Action" value={stats.noRecord + stats.mismatch} color="#d97706" />
        </section>
      ) : null}

      <section style={styles.attentionBand}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ color: '#7c2d12', fontSize: 13 }}>Attention</strong>
          <span style={{ color: '#9a3412', fontSize: 13 }}>
            {needsAttention} items need manual verification or follow-up.
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#9a3412', fontSize: 12 }}>
          <span>{user?.merchant?.businessName ?? 'PodSignal'}</span>
          <span style={{ color: '#c2410c' }} title="Same SSE stack as episode pages (reconnect + degraded when offline)">
            {sseLabel}
          </span>
          <span>{user?.email}</span>
        </div>
      </section>

      {liveStatus === 'degraded' ? (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#92400e',
            padding: '10px 12px',
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          Live updates are unavailable. The list will not refresh automatically — use the browser refresh
          or change page filter to reload data.
        </div>
      ) : null}

      <section style={styles.filtersRow}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setStatusFilter(tab.value);
              setPage(1);
            }}
            style={{
              ...styles.tab,
              ...(statusFilter === tab.value ? styles.tabActive : {}),
            }}
          >
            {tab.label}
          </button>
        ))}
      </section>

      <section style={styles.tableWrap}>
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
      </section>

      {/* Pagination */}
      {totalPages > 1 ? (
        <div style={styles.pagination}>
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} style={styles.pageBtn}>Prev</button>
          <span style={{ fontSize: 14, color: '#888' }}>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} style={styles.pageBtn}>Next</button>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  suffix,
}: {
  label: string;
  value: number;
  color: string;
  suffix?: string;
}) {
  return (
    <div style={styles.statCard}>
      <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
      <span style={{ fontSize: 34, fontWeight: 700, color }}>
        {value}
        {suffix ?? ''}
      </span>
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
    gap: 16,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  pageTitle: { fontSize: 34, lineHeight: 1.1, margin: 0, color: '#111827' },
  pageSubtitle: { fontSize: 14, color: '#6b7280', margin: '8px 0 0' },
  heroActions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  softBtn: {
    height: 34,
    padding: '0 12px',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#4b5563',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  primaryBtn: {
    height: 34,
    padding: '0 12px',
    borderRadius: 8,
    border: '1px solid #6d28d9',
    background: '#6d28d9',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12 },
  statCard: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    padding: 16,
    borderRadius: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  attentionBand: {
    background: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: 10,
    padding: '10px 14px',
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  filtersRow: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: 8,
  },
  tab: { padding: '7px 12px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 999, fontSize: 12, cursor: 'pointer', color: '#4b5563' },
  tabActive: { background: '#eef2ff', color: '#4338ca', borderColor: '#c7d2fe' },
  tableWrap: { background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase' },
  td: { padding: '14px 16px', fontSize: 13, borderBottom: '1px solid #f3f4f6', color: '#111827' },
  row: { cursor: 'pointer', transition: 'background 0.15s' },
  tierBadge: { display: 'inline-block', padding: '3px 10px', borderRadius: 999, color: 'white', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 20 },
  pageBtn: { padding: '8px 16px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
};
