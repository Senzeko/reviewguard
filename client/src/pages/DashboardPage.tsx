import { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSseConnection } from '../hooks/useSseConnection';
import { MeasurementHonestyBanner } from '../components/MeasurementHonestyBanner';
import { fetchPodsignalReportSummary, fetchPodsignalSummary, type PodsignalSummary } from '../api/client';
import './podsignal-pages.css';

/**
 * Home dashboard — observed KPIs from workspace APIs; lower sections are illustrative placeholders.
 */
export function DashboardPage() {
  const [observedClicks30d, setObservedClicks30d] = useState<number | null>(null);
  const [usageTotal30d, setUsageTotal30d] = useState<number | null>(null);
  const [summary, setSummary] = useState<PodsignalSummary | null>(null);
  const [metricsError, setMetricsError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPodsignalReportSummary(), fetchPodsignalSummary()])
      .then(([report, sum]) => {
        if (cancelled) return;
        setObservedClicks30d(report.trackableLinkClicksObserved);
        setUsageTotal30d(report.outputUsageEventTotal);
        setSummary(sum);
        setMetricsError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setObservedClicks30d(null);
        setUsageTotal30d(null);
        setSummary(null);
        setMetricsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sseHandlersRef = useRef<Record<string, () => void>>({});
  const { liveStatus } = useSseConnection({
    enabled: true,
    handlersRef: sseHandlersRef,
    reconnectDeps: [],
  });

  const sseLabel =
    liveStatus === 'live' ? 'Live' : liveStatus === 'connecting' ? 'Connecting' : 'Offline';

  return (
    <div className="ps-page">
      <div className="ps-page-head">
        <div>
          <h1 className="ps-page-title">Dashboard</h1>
          <p className="ps-page-sub">
            Last updated just now
            <span style={{ marginLeft: 10, color: '#6b7280', fontSize: 12 }} data-testid="dashboard-sse-status">
              · Live updates: {sseLabel}
            </span>
          </p>
        </div>
        <Link to="/shows" className="ps-btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }}>
          + New episode
        </Link>
      </div>

      <MeasurementHonestyBanner />

      {metricsError ? (
        <div
          className="ps-card"
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderLeft: '4px solid #f59e0b',
            background: '#fffbeb',
            color: '#92400e',
            fontSize: 13,
          }}
        >
          Could not load live workspace metrics (check login or run{' '}
          <code style={{ fontSize: 12 }}>npm run db:apply-0013</code> if the API returns schema errors).
        </div>
      ) : null}

      {liveStatus === 'degraded' ? (
        <div
          className="ps-card"
          style={{
            padding: '10px 12px',
            marginBottom: 12,
            background: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#92400e',
            fontSize: 13,
          }}
          data-testid="dashboard-sse-degraded"
        >
          Live connection unavailable — the app will not receive push updates until the connection recovers.
          Refresh the page after your network is stable.
        </div>
      ) : null}

      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 10px' }}>
        <strong style={{ color: '#374151' }}>Observed in PodSignal</strong> — counts below come from your workspace APIs.
        They are not third-party listener metrics.
      </p>
      <div className="ps-kpi-grid">
        <div className="ps-kpi">
          <div className="ps-kpi-label">Trackable link clicks (30d)</div>
          <div className="ps-kpi-value">{observedClicks30d === null ? '—' : observedClicks30d}</div>
          <div className="ps-kpi-meta" style={{ color: '#6b7280' }}>
            Evidence: observed (redirects)
          </div>
        </div>
        <div className="ps-kpi">
          <div className="ps-kpi-label">Product usage events (30d)</div>
          <div className="ps-kpi-value">{usageTotal30d === null ? '—' : usageTotal30d}</div>
          <div className="ps-kpi-meta" style={{ color: '#6b7280' }}>
            Evidence: observed (in-app)
          </div>
        </div>
        <div className="ps-kpi">
          <div className="ps-kpi-label">Shows</div>
          <div className="ps-kpi-value">{summary === null ? '—' : summary.shows}</div>
          <div className="ps-kpi-meta" style={{ color: '#6b7280' }}>
            Workspace
          </div>
        </div>
        <div className="ps-kpi">
          <div className="ps-kpi-label">Episodes</div>
          <div className="ps-kpi-value">{summary === null ? '—' : summary.episodes}</div>
          <div className="ps-kpi-meta" style={{ color: '#6b7280' }}>Observed count</div>
        </div>
        <div className="ps-kpi">
          <div className="ps-kpi-label">Active campaigns</div>
          <div className="ps-kpi-value">{summary === null ? '—' : summary.activeCampaigns}</div>
          <div className="ps-kpi-meta" style={{ color: '#6b7280' }}>Status ACTIVE</div>
        </div>
        <div className="ps-kpi">
          <div className="ps-kpi-label">Launch checklist (done / total)</div>
          <div className="ps-kpi-value" style={{ fontSize: 22 }}>
            {summary === null
              ? '—'
              : `${summary.launchTasksDone} / ${summary.launchTasksTotal}`}
          </div>
          <div className="ps-kpi-meta" style={{ color: '#6b7280' }}>
            Evidence: proxy (ops follow-through)
          </div>
        </div>
      </div>

      <p style={{ fontSize: 12, color: '#9ca3af', margin: '16px 0 8px' }}>
        <strong style={{ color: '#6b7280' }}>Illustrative sample blocks below</strong> — not your workspace data. Use{' '}
        <Link to="/episodes" style={{ color: '#4f46e5', fontWeight: 600 }}>
          Episodes
        </Link>{' '}
        → open an episode → <strong style={{ color: '#6b7280' }}>Launch</strong> for real approvals, links, and checklist.
      </p>

      <div className="ps-split-2">
        <section className="ps-card">
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px', color: '#111827' }}>Launching soon</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
            {[
              ['Episode 245: Market Trends', 'May 15 · 9:00 AM'],
              ['Growth Tactics Q2', 'May 16 · 6:00 AM'],
              ['Founder AMA', 'May 18 · 12:00 PM'],
            ].map(([t, d]) => (
              <li
                key={t}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  paddingBottom: 12,
                  borderBottom: '1px solid #f3f4f6',
                }}
              >
                <div className="ps-thumb" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{t}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>{d}</div>
                </div>
                <Link to="/campaigns" style={{ fontSize: 13, fontWeight: 600, color: '#4f46e5' }}>
                  View campaign
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="ps-card" style={{ borderLeft: '4px solid #fb923c' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px', color: '#111827' }}>Approval tasks</h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 14px' }}>5 tasks waiting</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
            {['Cover art', 'YouTube thumbnail', 'Newsletter draft'].map((x) => (
              <li key={x} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, color: '#374151' }}>{x}</span>
                <button type="button" className="ps-btn-outline" style={{ padding: '6px 12px', fontSize: 12 }}>
                  Review
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="ps-split-2">
        <section className="ps-card" style={{ borderLeft: '4px solid #ef4444' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px', color: '#111827' }}>Blocked items (sample)</h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 14px' }}>Placeholder copy — triage real issues from Episodes.</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
            <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: '#374151' }}>Missing sponsor read</span>
              <Link to="/episodes" style={{ fontSize: 13, fontWeight: 600, color: '#4f46e5' }}>
                Go to episodes
              </Link>
            </li>
            <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: '#374151' }}>YouTube upload failed</span>
              <Link to="/episodes" style={{ fontSize: 13, fontWeight: 600, color: '#4f46e5' }}>
                Go to episodes
              </Link>
            </li>
          </ul>
        </section>

        <section className="ps-card">
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px', color: '#111827' }}>Scheduled launches</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8, fontSize: 13, color: '#4b5563' }}>
            <li>Today 3:00 PM — EP 241 checklist</li>
            <li>Today 6:00 PM — Shorts batch</li>
            <li>Tomorrow 8:00 AM — Newsletter</li>
            <li>Tomorrow 11:00 AM — RSS publish</li>
          </ul>
        </section>
      </div>

      <section className="ps-card">
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px', color: '#111827' }}>Show performance (sample)</h2>
        <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 16px' }}>Illustrative table — not connected to your shows.</p>
        <div className="ps-table-wrap">
          <table className="ps-table">
            <thead>
              <tr>
                <th>Show</th>
                <th>Readiness</th>
                <th>Status</th>
                <th>Issues</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['The Daily Brief', '87%', 'Live', '2 issues'],
                ['Product Talk', '92%', 'Scheduled', 'All clear'],
                ['Growth Insights', '78%', 'Live', 'All clear'],
              ].map(([name, r, st, iss]) => (
                <tr key={name}>
                  <td style={{ fontWeight: 600, color: '#111827' }}>{name}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          flex: 1,
                          maxWidth: 120,
                          height: 6,
                          borderRadius: 4,
                          background: '#e5e7eb',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: r,
                            height: '100%',
                            borderRadius: 4,
                            background: Number(String(r).replace('%', '')) > 85 ? '#22c55e' : '#f59e0b',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{r}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`ps-badge ${st === 'Live' ? 'ps-badge--green' : 'ps-badge--yellow'}`}>{st}</span>
                  </td>
                  <td style={{ fontSize: 13, fontWeight: 600, color: iss === 'All clear' ? '#16a34a' : '#dc2626' }}>
                    {iss}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="ps-split-2">
        <section className="ps-card">
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px', color: '#111827' }}>Recent activity (sample)</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
            {[
              ['Cover art generated for Episode 241', '12 min ago', '#22c55e'],
              ['Campaign approved for EP 238', '1h ago', '#6366f1'],
              ['YouTube asset failed', '2h ago', '#f97316'],
            ].map(([text, time, dot]) => (
              <li key={text} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: dot, marginTop: 6, flexShrink: 0 }} />
                <div>
                  <div style={{ color: '#374151' }}>{text}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>{time}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="ps-card">
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px', color: '#111827' }}>Quick actions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Link
              to="/shows"
              className="ps-btn-primary"
              style={{ textAlign: 'center', textDecoration: 'none' }}
            >
              + New episode
            </Link>
            <Link to="/episodes" className="ps-btn-outline" style={{ textAlign: 'center', textDecoration: 'none' }}>
              Episode list &amp; launch
            </Link>
            <Link to="/reports" className="ps-btn-outline" style={{ textAlign: 'center', textDecoration: 'none' }}>
              View sponsor report
            </Link>
            <Link to="/analytics" className="ps-btn-outline" style={{ textAlign: 'center', textDecoration: 'none' }}>
              Open analytics
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
