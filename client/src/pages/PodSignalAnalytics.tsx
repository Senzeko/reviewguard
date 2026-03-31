import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import {
  createHostMetricSnapshot,
  deleteHostMetricSnapshot,
  fetchEpisodeOptionsForForms,
  fetchHostMetricSnapshots,
  fetchTitlePresetAnalytics,
  fetchPodsignalReportSummary,
  fetchPodsignalSummary,
  type HostMetricKey,
  type HostMetricSnapshotRow,
  type PodsignalReportSummary,
  type PodsignalSummary,
  type TitlePresetAnalyticsResponse,
} from '../api/client';
import { MeasurementHonestyBanner } from '../components/MeasurementHonestyBanner';
import { trackOutputUsage } from '../lib/trackOutputUsage';
import './PodSignalAnalytics.css';

const BAR_COLORS = ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#4f46e5', '#4338ca', '#3730a3', '#312e81'];

const HOST_METRIC_OPTIONS: { value: HostMetricKey; label: string }[] = [
  { value: 'spotify_streams_7d', label: 'Spotify streams (your 7-day window)' },
  { value: 'apple_plays_7d', label: 'Apple Podcasts plays (your 7-day window)' },
  { value: 'youtube_views_7d', label: 'YouTube views (your 7-day window)' },
  { value: 'rss_downloads_7d', label: 'RSS / downloads (your 7-day window)' },
  { value: 'newsletter_opens', label: 'Newsletter opens' },
  { value: 'other', label: 'Other (describe)' },
];

function displayMetricTitle(row: HostMetricSnapshotRow): string {
  if (row.metricKey === 'other' && row.customLabel) return row.customLabel;
  const opt = HOST_METRIC_OPTIONS.find((o) => o.value === row.metricKey);
  return opt?.label ?? row.metricKey.replace(/_/g, ' ');
}

function formatUsageLabel(key: string): string {
  return key.replace(/_/g, ' ');
}

function truncateLabel(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function buildInsights(
  summary: PodsignalSummary | null,
  report: PodsignalReportSummary | null,
  hostSnapshotCount: number,
): string[] {
  const out: string[] = [];
  if (report) {
    if (report.trackableLinkClicksObserved > 0) {
      out.push(
        `PodSignal logged ${report.trackableLinkClicksObserved} short-link redirect hit(s) in the last ${report.windowDays} days — someone opened your PodSignal URL, not a guaranteed unique listener.`,
      );
    } else {
      out.push(
        'No short-link redirect hits in this window yet. Create trackable links from episode launch and share them to see clicks here.',
      );
    }
    if (report.outputUsageEventTotal > 0) {
      out.push(
        `${report.outputUsageEventTotal} in-app usage event(s) recorded (copies, checklist completions, approvals, etc.).`,
      );
    }
  }
  if (summary && summary.launchTasksTotal > 0) {
    const open = summary.launchTasksTotal - summary.launchTasksDone;
    if (open > 0) {
      out.push(
        `${open} launch checklist task(s) still open across campaigns — a directional ops signal, not audience reach.`,
      );
    } else if (open === 0) {
      out.push('All recorded launch checklist tasks are marked done in this workspace (proxy for execution).');
    }
  }
  if (hostSnapshotCount > 0) {
    out.push(
      `You have ${hostSnapshotCount} self-reported host metric snapshot(s) below. PodSignal does not verify these numbers — they are for your own sponsor packet or internal tracking.`,
    );
  }
  out.push(
    'Spotify, Apple, YouTube, and ad-dashboard charts are not wired in closed beta. Use those tools directly, log snapshots below, or attach exports if you need listener totals next to PodSignal-observed events.',
  );
  return out.slice(0, 6);
}

export function PodSignalAnalytics() {
  const [summary, setSummary] = useState<PodsignalSummary | null>(null);
  const [report, setReport] = useState<PodsignalReportSummary | null>(null);
  const [reportError, setReportError] = useState('');
  const [loading, setLoading] = useState(true);
  const [hostSnapshots, setHostSnapshots] = useState<HostMetricSnapshotRow[]>([]);
  const [hostSnapshotsError, setHostSnapshotsError] = useState('');
  const [hostMetricsSchemaMissing, setHostMetricsSchemaMissing] = useState(false);
  const [episodeOptions, setEpisodeOptions] = useState<{ id: string; label: string }[]>([]);
  const [metricKey, setMetricKey] = useState<HostMetricKey>('spotify_streams_7d');
  const [customLabel, setCustomLabel] = useState('');
  const [metricValue, setMetricValue] = useState('');
  const [sourceNote, setSourceNote] = useState('');
  const [episodeId, setEpisodeId] = useState('');
  const [hostFormError, setHostFormError] = useState('');
  const [hostSaving, setHostSaving] = useState(false);
  const [presetAnalytics, setPresetAnalytics] = useState<TitlePresetAnalyticsResponse | null>(null);

  useEffect(() => {
    void trackOutputUsage({
      eventType: 'analytics_page_viewed',
      dedupeSessionKey: 'analytics_page',
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setReportError('');
    void (async () => {
      try {
        const s = await fetchPodsignalSummary();
        if (!cancelled) setSummary(s);
      } catch {
        if (!cancelled) setSummary(null);
      }
      try {
        const r = await fetchPodsignalReportSummary();
        if (!cancelled) {
          setReport(r);
          setReportError('');
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setReport(null);
        const ax = err as { response?: { status?: number; data?: { code?: string; migrationHint?: string } } };
        if (ax.response?.status === 503 && ax.response.data?.code === 'PODSIGNAL_PILOT_SCHEMA_MISSING') {
          setReportError(
            `Pilot schema missing: ${ax.response.data.migrationHint ?? 'Run npm run db:apply-0013'}`,
          );
        } else {
          setReportError('Could not load measurement window (launch proof API). Workspace counts may still apply.');
        }
      }
      try {
        const p = await fetchTitlePresetAnalytics();
        if (!cancelled) setPresetAnalytics(p);
      } catch {
        if (!cancelled) setPresetAnalytics(null);
      }
      try {
        const { snapshots } = await fetchHostMetricSnapshots();
        if (!cancelled) {
          setHostSnapshots(snapshots);
          setHostSnapshotsError('');
          setHostMetricsSchemaMissing(false);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setHostSnapshots([]);
        const ax = err as { response?: { status?: number; data?: { code?: string; migrationHint?: string } } };
        if (ax.response?.status === 503 && ax.response.data?.code === 'PODSIGNAL_HOST_METRICS_SCHEMA_MISSING') {
          setHostMetricsSchemaMissing(true);
          setHostSnapshotsError(
            ax.response.data.migrationHint ?? 'Run npm run db:apply-0014 to log host metrics.',
          );
        } else {
          setHostMetricsSchemaMissing(false);
          setHostSnapshotsError('Could not load host metric history.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const opts = await fetchEpisodeOptionsForForms(400);
        if (!cancelled) setEpisodeOptions(opts);
      } catch {
        if (!cancelled) setEpisodeOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const usageBars = useMemo(() => {
    if (!report) return [];
    return Object.entries(report.outputUsageByType)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([key, count]) => ({
        name: truncateLabel(formatUsageLabel(key), 22),
        count,
        fullKey: key,
      }));
  }, [report]);

  const clickBars = useMemo(() => {
    if (!report?.clicksByEpisode.length) return [];
    return report.clicksByEpisode.map((r) => ({
      name: truncateLabel(r.episodeTitle, 16),
      clicks: r.clicks,
      episodeId: r.episodeId,
    }));
  }, [report]);

  const insights = useMemo(
    () => buildInsights(summary, report, hostSnapshots.length),
    [summary, report, hostSnapshots.length],
  );

  async function submitHostMetric(e: FormEvent) {
    e.preventDefault();
    setHostFormError('');
    const v = parseInt(metricValue.replace(/,/g, ''), 10);
    if (!Number.isFinite(v) || v < 0) {
      setHostFormError('Enter a non-negative whole number.');
      return;
    }
    if (metricKey === 'other' && !customLabel.trim()) {
      setHostFormError('Add a short label for the custom metric.');
      return;
    }
    setHostSaving(true);
    try {
      await createHostMetricSnapshot({
        metricKey,
        customLabel: metricKey === 'other' ? customLabel.trim() : null,
        value: v,
        sourceNote: sourceNote.trim() || null,
        episodeId: episodeId || null,
      });
      void trackOutputUsage({
        eventType: 'host_metric_snapshot_logged',
        payload: { metricKey, episodeId: episodeId || null, value: v },
      });
      const { snapshots } = await fetchHostMetricSnapshots();
      setHostSnapshots(snapshots);
      setHostSnapshotsError('');
      setHostMetricsSchemaMissing(false);
      setMetricValue('');
      setSourceNote('');
      if (metricKey === 'other') setCustomLabel('');
    } catch (err: unknown) {
      const ax = err as { response?: { status?: number; data?: { code?: string } } };
      if (ax.response?.status === 503 && ax.response.data?.code === 'PODSIGNAL_HOST_METRICS_SCHEMA_MISSING') {
        setHostMetricsSchemaMissing(true);
      }
      setHostFormError('Could not save. If the database is not migrated, run npm run db:apply-0014.');
    } finally {
      setHostSaving(false);
    }
  }

  async function removeHostSnapshot(id: string) {
    try {
      await deleteHostMetricSnapshot(id);
      const { snapshots } = await fetchHostMetricSnapshots();
      setHostSnapshots(snapshots);
    } catch {
      /* ignore */
    }
  }

  const windowDays = report?.windowDays ?? 30;
  const clicks = report?.trackableLinkClicksObserved ?? null;
  const usageTotal = report?.outputUsageEventTotal ?? null;
  const approvals = report?.launchPackApprovalsObserved ?? null;
  const activeCampaigns = summary?.activeCampaigns ?? null;
  const shows = summary?.shows ?? null;
  const episodes = summary?.episodes ?? null;
  const tasksDone = summary?.launchTasksDone ?? report?.workspace.launchTasksDone ?? null;
  const tasksTotal = summary?.launchTasksTotal ?? report?.workspace.launchTasksTotal ?? null;

  return (
    <div className="analytics-root">
      <div style={{ padding: '0 24px 0', maxWidth: 1400, margin: '0 auto' }}>
        <MeasurementHonestyBanner />
      </div>
      <header className="analytics-header">
        <div className="analytics-title-block">
          <h1>Analytics</h1>
          <p>
            {loading
              ? 'Loading workspace-observed metrics…'
              : report
                ? `Rolling ${windowDays}-day window (same as launch proof report)${summary != null ? ` · ${summary.shows} shows · ${summary.episodes} episodes` : ''}`
                : summary != null
                  ? `${summary.shows} shows · ${summary.episodes} episodes — measurement window unavailable`
                  : 'Workspace metrics'}
          </p>
        </div>
        <div className="analytics-toolbar">
          <span
            className="analytics-date-btn"
            title="Window is fixed server-side for the pilot; matches Sponsor Reports."
            style={{ cursor: 'default' }}
          >
            <span aria-hidden>📅</span> Last {windowDays} days
          </span>
          <Link
            to="/reports"
            className="analytics-btn-export"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            Launch proof report
          </Link>
        </div>
      </header>

      {reportError ? (
        <div
          className="analytics-card"
          style={{
            marginBottom: 16,
            borderLeft: '4px solid #dc2626',
            background: '#fef2f2',
            color: '#991b1b',
            fontSize: 14,
            padding: 14,
          }}
        >
          <strong>Measurement data limited.</strong> {reportError}
        </div>
      ) : null}

      <p className="analytics-demo-note">
        Figures below are <strong>PodSignal-observed</strong> only (usage events, short-link redirects, checklist proxy).
        There are no sample listen counts or host-platform charts on this page.
      </p>

      <div className="analytics-kpi-grid">
        <div className="analytics-kpi">
          <div className="analytics-kpi-label">Short-link clicks</div>
          <div className="analytics-kpi-value" data-testid="analytics-trackable-clicks">
            {loading ? '…' : clicks == null ? '—' : clicks}
          </div>
          <span className="analytics-kpi-meta">Observed redirects</span>
        </div>
        <div className="analytics-kpi">
          <div className="analytics-kpi-label">Usage events</div>
          <div className="analytics-kpi-value">{loading ? '…' : usageTotal == null ? '—' : usageTotal}</div>
          <span className="analytics-kpi-meta">In-app, rolling window</span>
        </div>
        <div className="analytics-kpi">
          <div className="analytics-kpi-label">Launch packs approved</div>
          <div className="analytics-kpi-value">{loading ? '…' : approvals == null ? '—' : approvals}</div>
          <span className="analytics-kpi-meta">Recorded in product</span>
        </div>
        <div className="analytics-kpi">
          <div className="analytics-kpi-label">Checklist done / total</div>
          <div className="analytics-kpi-value" style={{ fontSize: 22 }}>
            {loading ? '…' : tasksDone == null || tasksTotal == null ? '—' : `${tasksDone}/${tasksTotal}`}
          </div>
          <span className="analytics-kpi-meta">Proxy — ops follow-through</span>
        </div>
        <div className="analytics-kpi">
          <div className="analytics-kpi-label">Active campaigns</div>
          <div className="analytics-kpi-value">{loading ? '…' : activeCampaigns == null ? '—' : activeCampaigns}</div>
          <span className="analytics-kpi-meta">Status ACTIVE</span>
        </div>
        <div className="analytics-kpi">
          <div className="analytics-kpi-label">Shows · Episodes</div>
          <div className="analytics-kpi-value" style={{ fontSize: 18 }}>
            {loading ? '…' : shows == null || episodes == null ? '—' : `${shows} · ${episodes}`}
          </div>
          <span className="analytics-kpi-meta">Workspace totals</span>
        </div>
      </div>

      <div className="analytics-card" style={{ marginBottom: 20 }}>
        <h2 className="analytics-card-title">Title preset adoption</h2>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ps-muted)' }}>
          Default strategy usage vs manual overrides (tone/niche), last {presetAnalytics?.windowDays ?? windowDays} days.
        </p>
        {presetAnalytics ? (
          <>
            <div className="analytics-kpi-grid" style={{ marginTop: 0 }}>
              <div className="analytics-kpi">
                <div className="analytics-kpi-label">Defaults applied</div>
                <div className="analytics-kpi-value">{presetAnalytics.totals.defaultsApplied}</div>
                <span className="analytics-kpi-meta">All title surfaces</span>
              </div>
              <div className="analytics-kpi">
                <div className="analytics-kpi-label">Overrides</div>
                <div className="analytics-kpi-value">{presetAnalytics.totals.overrides}</div>
                <span className="analytics-kpi-meta">Tone/niche manual changes</span>
              </div>
              <div className="analytics-kpi">
                <div className="analytics-kpi-label">Override rate</div>
                <div className="analytics-kpi-value">{Math.round(presetAnalytics.totals.overrideRate * 100)}%</div>
                <span className="analytics-kpi-meta">Lower = defaults fit better</span>
              </div>
              <div className="analytics-kpi">
                <div className="analytics-kpi-label">Episode detail</div>
                <div className="analytics-kpi-value" style={{ fontSize: 18 }}>
                  {presetAnalytics.surfaces.episodeDetail.defaultsApplied}/
                  {presetAnalytics.surfaces.episodeDetail.overrides}
                </div>
                <span className="analytics-kpi-meta">defaults / overrides</span>
              </div>
              <div className="analytics-kpi">
                <div className="analytics-kpi-label">Episode launch</div>
                <div className="analytics-kpi-value" style={{ fontSize: 18 }}>
                  {presetAnalytics.surfaces.episodeLaunch.defaultsApplied}/
                  {presetAnalytics.surfaces.episodeLaunch.overrides}
                </div>
                <span className="analytics-kpi-meta">defaults / overrides</span>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <h3 style={{ fontSize: 14, margin: '0 0 8px', color: '#111827' }}>Top override transitions</h3>
              {presetAnalytics.topOverrideTransitions.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--ps-muted)', fontSize: 13 }}>
                  No overrides logged in this window.
                </p>
              ) : (
                <div className="analytics-table-wrap">
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Kind</th>
                        <th>From</th>
                        <th>To</th>
                        <th>Surface</th>
                        <th>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {presetAnalytics.topOverrideTransitions.map((t, idx) => (
                        <tr key={`${t.kind}-${t.from}-${t.to}-${t.surface}-${idx}`}>
                          <td style={{ textTransform: 'capitalize' }}>{t.kind}</td>
                          <td>{t.from}</td>
                          <td>{t.to}</td>
                          <td>{t.surface.replace('_', ' ')}</td>
                          <td>{t.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          <p style={{ margin: 0, color: 'var(--ps-muted)', fontSize: 14 }}>
            Preset adoption data unavailable.
          </p>
        )}
      </div>

      <div className="analytics-row-2">
        <div className="analytics-card">
          <h2 className="analytics-card-title">Output usage by event type</h2>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ps-muted)' }}>
            Top event types in the rolling window (zero-count types hidden).
          </p>
          <div className="analytics-chart-h">
            {usageBars.length === 0 ? (
              <p style={{ padding: 24, color: 'var(--ps-muted)', fontSize: 14, margin: 0 }}>
                {report ? 'No usage events in this window — copy launch assets and use the checklist on episode pages.' : '—'}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={usageBars} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip formatter={(value) => [value ?? 0, 'Count']} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {usageBars.map((_, i) => (
                      <Cell key={usageBars[i].fullKey} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="analytics-card">
          <h2 className="analytics-card-title">Short-link clicks by episode</h2>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ps-muted)' }}>
            Observed redirect hits only — not platform play counts.
          </p>
          <div className="analytics-chart-h">
            {clickBars.length === 0 ? (
              <p style={{ padding: 24, color: 'var(--ps-muted)', fontSize: 14, margin: 0 }}>
                {report
                  ? 'No clicks yet — open a trackable link in a browser or share it with your audience.'
                  : '—'}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={clickBars} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="clicks" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="analytics-card" style={{ marginBottom: 20 }}>
        <h2 className="analytics-card-title">Host platforms & audience scale</h2>
        <p style={{ margin: 0, fontSize: 14, color: '#4b5563', lineHeight: 1.65 }}>
          Listener, subscriber, and impression trends from Spotify, Apple Podcasts, YouTube, and ad networks are{' '}
          <strong>not</strong> shown here in closed beta. When you need those numbers for sponsors, export them from the host
          or ads tool and pair them with this page’s PodSignal-observed events so claims stay honest.
        </p>
      </div>

      <div className="analytics-card" style={{ marginBottom: 20, borderLeft: '3px solid #d97706' }}>
        <h2 className="analytics-card-title">Host metrics you enter (self-reported)</h2>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: '#4b5563', lineHeight: 1.65 }}>
          Log numbers you copied from Spotify for Podcasters, Apple, YouTube, your host, or email — with your own window
          (e.g. last 7 days). These rows are <strong>not</strong> observed or verified by PodSignal; they exist so you can
          keep sponsor-facing context next to PodSignal redirect and usage data.
        </p>
        {hostSnapshotsError ? (
          <p style={{ color: '#b45309', fontSize: 14, marginBottom: 12 }}>
            <strong>History unavailable.</strong> {hostSnapshotsError}
          </p>
        ) : null}
        <form
          onSubmit={(e) => void submitHostMetric(e)}
          style={{
            display: 'grid',
            gap: 12,
            marginBottom: 20,
            padding: 14,
            background: '#fafafa',
            borderRadius: 10,
            border: '1px solid var(--ps-border)',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Metric
              <select
                className="analytics-select"
                value={metricKey}
                onChange={(e) => setMetricKey(e.target.value as HostMetricKey)}
                aria-label="Metric type"
              >
                {HOST_METRIC_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {metricKey === 'other' ? (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600, flex: 1, minWidth: 180 }}>
                Custom label
                <input
                  className="analytics-select"
                  style={{ height: 38 }}
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  maxLength={80}
                  placeholder="e.g. Paid social landing page visits"
                />
              </label>
            ) : null}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Value
              <input
                className="analytics-select"
                style={{ height: 38, width: 120 }}
                inputMode="numeric"
                value={metricValue}
                onChange={(e) => setMetricValue(e.target.value)}
                placeholder="0"
                aria-label="Metric value"
              />
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
            Where this came from (optional)
            <input
              className="analytics-select"
              style={{ height: 38 }}
              value={sourceNote}
              onChange={(e) => setSourceNote(e.target.value)}
              maxLength={500}
              placeholder="e.g. Spotify for Podcasters → Analytics → Mar 1–7"
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
            Episode (optional)
            <select
              className="analytics-select"
              value={episodeId}
              onChange={(e) => setEpisodeId(e.target.value)}
              aria-label="Attach to episode"
            >
              <option value="">Workspace-wide (not tied to one episode)</option>
              {episodeOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {hostFormError ? (
            <p style={{ color: '#dc2626', fontSize: 13, margin: 0 }}>{hostFormError}</p>
          ) : null}
          <button
            type="submit"
            className="analytics-btn-primary"
            disabled={hostSaving || hostMetricsSchemaMissing}
            style={{ justifySelf: 'start', border: 'none', cursor: hostSaving ? 'wait' : 'pointer' }}
          >
            {hostSaving ? 'Saving…' : 'Save snapshot'}
          </button>
        </form>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px' }}>Saved snapshots</h3>
        {hostSnapshots.length === 0 && !hostSnapshotsError ? (
          <p style={{ color: 'var(--ps-muted)', fontSize: 14, margin: 0 }}>None yet — add your first row above.</p>
        ) : null}
        {hostSnapshots.length > 0 ? (
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Value</th>
                  <th>Episode</th>
                  <th>Source note</th>
                  <th>Logged</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {hostSnapshots.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{displayMetricTitle(row)}</td>
                    <td>{row.value.toLocaleString()}</td>
                    <td style={{ fontSize: 13, color: '#4b5563' }}>
                      {row.episodeTitle ?? (row.episodeId ? 'Episode' : '—')}
                    </td>
                    <td style={{ fontSize: 13, color: '#4b5563' }}>{row.sourceNote || '—'}</td>
                    <td style={{ fontSize: 13, color: '#6b7280' }}>{new Date(row.createdAt).toLocaleString()}</td>
                    <td>
                      <button
                        type="button"
                        className="analytics-btn-ghost"
                        style={{ fontSize: 12, padding: '4px 10px' }}
                        onClick={() => void removeHostSnapshot(row.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="analytics-insights analytics-card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Key insights</h3>
        {insights.map((t, i) => (
          <div key={i} className="analytics-insight-item">
            {t}
          </div>
        ))}
      </div>

      <div className="analytics-actions">
        <Link to="/reports" className="analytics-btn-secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>
          Open launch proof report
        </Link>
        <Link to="/episodes" className="analytics-btn-primary" style={{ textDecoration: 'none', textAlign: 'center' }}>
          Go to episodes
        </Link>
        <Link to="/dashboard" className="analytics-btn-ghost" style={{ textDecoration: 'none', textAlign: 'center' }}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
