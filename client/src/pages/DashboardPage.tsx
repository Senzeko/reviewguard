import { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSseConnection } from '../hooks/useSseConnection';
import { MeasurementHonestyBanner } from '../components/MeasurementHonestyBanner';
import {
  fetchDashboardFeed,
  fetchPodsignalReportSummary,
  fetchPodsignalSummary,
  type DashboardFeedResponse,
  type PodsignalSummary,
} from '../api/client';
import './podsignal-pages.css';

function statusChip(status: string): { label: string; className: string } {
  if (status === 'READY') return { label: 'Ready', className: 'ps-badge ps-badge--green' };
  if (status === 'PROCESSING') return { label: 'Processing', className: 'ps-badge ps-badge--yellow' };
  if (status === 'FAILED') return { label: 'Failed', className: 'ps-badge ps-badge--red' };
  return { label: status, className: 'ps-badge' };
}

function activityLabel(eventType: string): string {
  const labels: Record<string, string> = {
    title_selected: 'Title selected',
    title_copied: 'Title copied',
    launch_pack_approved: 'Launch pack approved',
    sponsor_report_exported: 'Sponsor PDF exported',
    sponsor_one_pager_exported: 'Sponsor brief exported',
    trackable_link_created: 'Trackable link created',
    title_preset_default_applied: 'Title defaults applied',
    title_preset_overridden: 'Title preset overridden',
  };
  return labels[eventType] ?? eventType.replaceAll('_', ' ');
}

export function DashboardPage() {
  const [observedClicks30d, setObservedClicks30d] = useState<number | null>(null);
  const [usageTotal30d, setUsageTotal30d] = useState<number | null>(null);
  const [summary, setSummary] = useState<PodsignalSummary | null>(null);
  const [feed, setFeed] = useState<DashboardFeedResponse | null>(null);
  const [metricsError, setMetricsError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPodsignalReportSummary(), fetchPodsignalSummary(), fetchDashboardFeed()])
      .then(([report, sum, dashboardFeed]) => {
        if (cancelled) return;
        setObservedClicks30d(report.trackableLinkClicksObserved);
        setUsageTotal30d(report.outputUsageEventTotal);
        setSummary(sum);
        setFeed(dashboardFeed);
        setMetricsError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setObservedClicks30d(null);
        setUsageTotal30d(null);
        setSummary(null);
        setFeed(null);
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

      <div className="ps-split-2">
        <section className="ps-card">
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px', color: '#111827' }}>Recent episodes</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
            {(feed?.recentEpisodes ?? []).length === 0 ? (
              <li style={{ fontSize: 13, color: '#6b7280' }}>
                No episodes yet. Create your first one from <Link to="/shows">Shows</Link>.
              </li>
            ) : (
              (feed?.recentEpisodes ?? []).slice(0, 6).map((ep) => {
                const chip = statusChip(ep.status);
                return (
                  <li
                    key={ep.id}
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
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{ep.title}</div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>
                        {ep.podcastTitle} · {new Date(ep.updatedAt).toLocaleString()}
                      </div>
                    </div>
                    <span className={chip.className}>{chip.label}</span>
                    <Link to={`/episodes/${ep.id}`} style={{ fontSize: 13, fontWeight: 600, color: '#4f46e5' }}>
                      Open
                    </Link>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        <section className="ps-card" style={{ borderLeft: '4px solid #fb923c' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px', color: '#111827' }}>Open launch tasks</h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 14px' }}>
            {(feed?.attentionItems ?? []).filter((x) => x.type === 'open_task').length} active checklist items
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
            {(feed?.attentionItems ?? []).filter((x) => x.type === 'open_task').slice(0, 5).map((item) => (
              <li key={`${item.episodeId}-${item.detail}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, color: '#374151' }}>
                  {item.detail}
                  <span style={{ color: '#9ca3af' }}> · {item.episodeTitle}</span>
                </span>
                <Link
                  to={`/episodes/${item.episodeId}/launch`}
                  className="ps-btn-outline"
                  style={{ padding: '6px 12px', fontSize: 12, textDecoration: 'none' }}
                >
                  Review
                </Link>
              </li>
            ))}
            {(feed?.attentionItems ?? []).filter((x) => x.type === 'open_task').length === 0 ? (
              <li style={{ fontSize: 13, color: '#6b7280' }}>No open launch tasks right now.</li>
            ) : null}
          </ul>
        </section>
      </div>

      <div className="ps-split-2">
        <section className="ps-card" style={{ borderLeft: '4px solid #ef4444' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px', color: '#111827' }}>Blocked items</h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 14px' }}>Processing failures and launch blockers detected from live data.</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
            {(feed?.attentionItems ?? [])
              .filter((x) => x.type === 'failed_episode')
              .slice(0, 5)
              .map((item) => (
                <li key={`${item.episodeId}-${item.detail}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, color: '#374151' }}>
                    {item.episodeTitle}
                    <span style={{ color: '#9ca3af' }}> · {item.detail}</span>
                  </span>
                  <Link to={`/episodes/${item.episodeId}`} style={{ fontSize: 13, fontWeight: 600, color: '#4f46e5' }}>
                    Open episode
                  </Link>
                </li>
              ))}
            {(feed?.attentionItems ?? []).filter((x) => x.type === 'failed_episode').length === 0 ? (
              <li style={{ fontSize: 13, color: '#6b7280' }}>No failed episodes in your workspace.</li>
            ) : null}
          </ul>
        </section>

        <section className="ps-card">
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px', color: '#111827' }}>First sponsor-proof checklist</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8, fontSize: 13, color: '#4b5563' }}>
            <li>{summary && summary.shows > 0 ? '✓' : '•'} Create at least one show</li>
            <li>{summary && summary.episodes > 0 ? '✓' : '•'} Add and process one episode</li>
            <li>{observedClicks30d && observedClicks30d > 0 ? '✓' : '•'} Generate and click a trackable launch link</li>
            <li>{usageTotal30d && usageTotal30d > 0 ? '✓' : '•'} Export a sponsor brief from Reports</li>
          </ul>
        </section>
      </div>

      <div className="ps-split-2">
        <section className="ps-card">
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px', color: '#111827' }}>Recent activity</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
            {(feed?.recentActivity ?? []).slice(0, 8).map((a) => (
              <li key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: '#6366f1', marginTop: 6, flexShrink: 0 }} />
                <div>
                  <div style={{ color: '#374151' }}>
                    {activityLabel(a.eventType)}
                    {a.episodeTitle ? ` · ${a.episodeTitle}` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>{new Date(a.createdAt).toLocaleString()}</div>
                </div>
              </li>
            ))}
            {(feed?.recentActivity ?? []).length === 0 ? (
              <li style={{ fontSize: 13, color: '#6b7280' }}>No activity yet. Start from Shows or an episode launch page.</li>
            ) : null}
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
