import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { api } from '../api/client';

interface TrendPoint { date: string; reviews: number }
interface ScoreBucket { bucket: string; count: number }
interface TierBreakdown { disputable: number; advisory: number; legitimate: number; notReady: number }
interface DisputeRate { total: number; scored: number; confirmed: number; exported: number; confirmRate: number; exportRate: number }
interface RatingBucket { rating: number; count: number }

const COLORS = ['#E24B4A', '#BA7417', '#1F8FD9', '#1D9E75', '#888'];
const TIER_COLORS = ['#E24B4A', '#BA7417', '#1D9E75', '#ccc'];

export function Analytics() {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [scores, setScores] = useState<ScoreBucket[]>([]);
  const [tiers, setTiers] = useState<TierBreakdown | null>(null);
  const [dispute, setDispute] = useState<DisputeRate | null>(null);
  const [ratings, setRatings] = useState<RatingBucket[]>([]);

  useEffect(() => {
    api.get(`/api/analytics/trends?days=${days}`).then(r => setTrends(r.data.data)).catch(() => {});
  }, [days]);

  useEffect(() => {
    api.get('/api/analytics/score-distribution').then(r => setScores(r.data.data)).catch(() => {});
    api.get('/api/analytics/tier-breakdown').then(r => setTiers(r.data)).catch(() => {});
    api.get('/api/analytics/dispute-rate').then(r => setDispute(r.data)).catch(() => {});
    api.get('/api/analytics/rating-breakdown').then(r => setRatings(r.data.data)).catch(() => {});
  }, []);

  const tierPieData = tiers ? [
    { name: 'Disputable', value: tiers.disputable },
    { name: 'Advisory', value: tiers.advisory },
    { name: 'Legitimate', value: tiers.legitimate },
    { name: 'Not Ready', value: tiers.notReady },
  ].filter(d => d.value > 0) : [];

  return (
    <div style={styles.page}>
      <section style={styles.heroCard}>
        <div>
          <h1 style={styles.title}>Analytics</h1>
          <p style={styles.subtitle}>Monitor performance, scoring distribution, and dispute outcomes.</p>
        </div>
        <button onClick={() => navigate('/dashboard')} style={styles.backBtn}>
          Back to Dashboard
        </button>
      </section>

      {/* Review Trends */}
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={styles.cardTitle}>Review Trends</h2>
          <select value={days} onChange={e => setDays(Number(e.target.value))} style={styles.select}>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={trends}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="reviews" stroke="#6d28d9" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={styles.grid2}>
        {/* Score Distribution */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Score Distribution</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={scores}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {scores.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tier Breakdown Pie */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Tier Breakdown</h2>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={tierPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                {tierPieData.map((_, i) => (
                  <Cell key={i} fill={TIER_COLORS[i % TIER_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={styles.grid2}>
        {/* Rating Breakdown */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Rating Breakdown</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={ratings}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" />
              <XAxis dataKey="rating" tick={{ fontSize: 11 }} tickFormatter={v => `${v}★`} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#6d28d9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Dispute Funnel */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Dispute Funnel</h2>
          {dispute && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 0' }}>
              <FunnelStep label="Total Reviews" value={dispute.total} color="#1F4E79" />
              <FunnelStep label="Scored" value={dispute.scored} color="#BA7417" />
              <FunnelStep label="Confirmed by Human" value={dispute.confirmed} pct={dispute.confirmRate} color="#1D9E75" />
              <FunnelStep label="PDF Exported" value={dispute.exported} pct={dispute.exportRate} color="#E24B4A" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FunnelStep({ label, value, pct, color }: { label: string; value: number; pct?: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 14, color: '#333', flex: 1 }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 700, color }}>{value}</span>
      {pct !== undefined && <span style={{ fontSize: 12, color: '#888' }}>({pct}%)</span>}
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
  backBtn: {
    padding: '8px 12px',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 12,
    cursor: 'pointer',
    color: '#4b5563',
    fontWeight: 600,
  },
  card: { background: '#fff', borderRadius: 12, padding: 18, border: '1px solid #e5e7eb' },
  cardTitle: { fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
  select: { padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#4b5563' },
};
