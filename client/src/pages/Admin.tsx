import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

interface SystemStats {
  merchants: number;
  users: number;
  reviews: number;
  transactions: number;
  pendingReviews: number;
  processingReviews: number;
}

interface MerchantRow {
  id: string;
  businessName: string;
  googlePlaceId: string;
  posProvider: string;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
}

interface InvestigationRow {
  id: string;
  merchantId: string;
  reviewerDisplayName: string;
  reviewRating: number;
  confidenceScore: number | null;
  matchStatus: string;
  llmInferenceFlag: boolean;
  humanReviewedAt: string | null;
  createdAt: string;
}

type Tab = 'overview' | 'merchants' | 'investigations';

export function Admin() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [merchantTotal, setMerchantTotal] = useState(0);
  const [merchantPage, setMerchantPage] = useState(1);
  const [merchantSearch, setMerchantSearch] = useState('');
  const [investigations, setInvestigations] = useState<InvestigationRow[]>([]);
  const [invTotal, setInvTotal] = useState(0);
  const [invPage, setInvPage] = useState(1);
  const [invStatus, setInvStatus] = useState('');

  // Load stats
  useEffect(() => {
    api.get('/api/admin/stats').then(r => setStats(r.data)).catch(() => {});
  }, []);

  // Load merchants
  useEffect(() => {
    if (tab !== 'merchants') return;
    api.get('/api/admin/merchants', { params: { page: merchantPage, limit: 20, search: merchantSearch || undefined } })
      .then(r => { setMerchants(r.data.data); setMerchantTotal(r.data.total); })
      .catch(() => {});
  }, [tab, merchantPage, merchantSearch]);

  // Load investigations
  useEffect(() => {
    if (tab !== 'investigations') return;
    api.get('/api/admin/investigations', { params: { page: invPage, limit: 20, status: invStatus || undefined } })
      .then(r => { setInvestigations(r.data.data); setInvTotal(r.data.total); })
      .catch(() => {});
  }, [tab, invPage, invStatus]);

  async function toggleMerchant(id: string) {
    await api.post(`/api/admin/merchants/${id}/toggle`);
    setMerchants(prev => prev.map(m => m.id === id ? { ...m, isActive: !m.isActive } : m));
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Admin Panel</h1>
        <button onClick={() => navigate('/dashboard')} style={styles.backBtn}>Back to Dashboard</button>
      </header>

      {/* Tabs */}
      <div style={styles.tabs}>
        {(['overview', 'merchants', 'investigations'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && stats && (
        <div style={styles.statsGrid}>
          <StatCard label="Merchants" value={stats.merchants} color="#1F4E79" />
          <StatCard label="Users" value={stats.users} color="#1F8FD9" />
          <StatCard label="Reviews" value={stats.reviews} color="#1D9E75" />
          <StatCard label="Transactions" value={stats.transactions} color="#BA7417" />
          <StatCard label="Pending" value={stats.pendingReviews} color="#E24B4A" />
          <StatCard label="Processing" value={stats.processingReviews} color="#888" />
        </div>
      )}

      {/* Merchants */}
      {tab === 'merchants' && (
        <div>
          <input
            type="text"
            placeholder="Search merchants..."
            value={merchantSearch}
            onChange={e => { setMerchantSearch(e.target.value); setMerchantPage(1); }}
            style={styles.search}
          />
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Business</th>
                  <th style={styles.th}>POS</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Last Sync</th>
                  <th style={styles.th}>Created</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {merchants.map(m => (
                  <tr key={m.id} style={styles.row}>
                    <td style={styles.td}>{m.businessName}</td>
                    <td style={styles.td}>{m.posProvider}</td>
                    <td style={styles.td}>
                      <span style={{ color: m.isActive ? '#1D9E75' : '#E24B4A', fontWeight: 600, fontSize: 12 }}>
                        {m.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={styles.td}>{m.lastSyncAt ? new Date(m.lastSyncAt).toLocaleDateString() : '-'}</td>
                    <td style={styles.td}>{new Date(m.createdAt).toLocaleDateString()}</td>
                    <td style={styles.td}>
                      <button onClick={() => void toggleMerchant(m.id)} style={styles.smallBtn}>
                        {m.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={merchantPage} total={merchantTotal} limit={20} onChange={setMerchantPage} />
        </div>
      )}

      {/* Investigations */}
      {tab === 'investigations' && (
        <div>
          <select value={invStatus} onChange={e => { setInvStatus(e.target.value); setInvPage(1); }} style={styles.search}>
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="PROCESSING">Processing</option>
            <option value="VERIFIED">Verified</option>
            <option value="MISMATCH">Mismatch</option>
            <option value="NO_RECORD">No Record</option>
          </select>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Reviewer</th>
                  <th style={styles.th}>Rating</th>
                  <th style={styles.th}>Score</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>LLM</th>
                  <th style={styles.th}>Reviewed</th>
                  <th style={styles.th}>Created</th>
                </tr>
              </thead>
              <tbody>
                {investigations.map(inv => (
                  <tr key={inv.id} style={styles.row} onClick={() => navigate(`/console/${inv.id}`)}>
                    <td style={styles.td}>{inv.reviewerDisplayName}</td>
                    <td style={styles.td}>{'★'.repeat(inv.reviewRating)}</td>
                    <td style={styles.td}>{inv.confidenceScore ?? '-'}</td>
                    <td style={styles.td}><span style={{ fontSize: 12, fontWeight: 600 }}>{inv.matchStatus}</span></td>
                    <td style={styles.td}>{inv.llmInferenceFlag ? 'Yes' : 'No'}</td>
                    <td style={styles.td}>{inv.humanReviewedAt ? '\u2713' : '-'}</td>
                    <td style={styles.td}>{new Date(inv.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={invPage} total={invTotal} limit={20} onChange={setInvPage} />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: 'white', padding: 20, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 13, color: '#888' }}>{label}</span>
      <span style={{ fontSize: 28, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

function Pagination({ page, total, limit, onChange }: { page: number; total: number; limit: number; onChange: (p: number) => void }) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 20 }}>
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} style={styles.pageBtn}>Prev</button>
      <span style={{ fontSize: 14, color: '#888' }}>Page {page} of {totalPages}</span>
      <button disabled={page >= totalPages} onClick={() => onChange(page + 1)} style={styles.pageBtn}>Next</button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '24px 16px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 22, fontWeight: 700, color: '#1F4E79' },
  backBtn: { padding: '8px 16px', background: 'white', border: '1px solid #d1d1d1', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#444' },
  tabs: { display: 'flex', gap: 4, marginBottom: 20 },
  tab: { padding: '8px 16px', background: 'white', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#444' },
  tabActive: { background: '#1F4E79', color: 'white', borderColor: '#1F4E79' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 },
  search: { padding: '8px 14px', border: '1px solid #d1d1d1', borderRadius: 8, fontSize: 14, width: 300, marginBottom: 16 },
  tableWrap: { background: 'white', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#888', borderBottom: '1px solid #e0e0e0', textTransform: 'uppercase' },
  td: { padding: '14px 16px', fontSize: 14, borderBottom: '1px solid #f0f0f0' },
  row: { cursor: 'pointer', transition: 'background 0.15s' },
  smallBtn: { padding: '4px 10px', background: 'white', border: '1px solid #d1d1d1', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  pageBtn: { padding: '8px 16px', background: 'white', border: '1px solid #d1d1d1', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
};
