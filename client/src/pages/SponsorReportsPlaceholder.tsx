import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  downloadPodsignalSponsorReportPdf,
  fetchPodsignalReportSummary,
  type PodsignalReportSummary,
} from '../api/client';
import { MeasurementHonestyBanner } from '../components/MeasurementHonestyBanner';
import { trackOutputUsage } from '../lib/trackOutputUsage';
import './podsignal-pages.css';
import './pilot-report.css';

function formatExportDocument(report: PodsignalReportSummary): string {
  const lines: string[] = [
    '══════════════════════════════════════════════════════════════',
    '  PODSIGNAL — LAUNCH & SPONSOR PROOF',
    '  Closed beta · confidential · counts from PodSignal only',
    '══════════════════════════════════════════════════════════════',
    '',
    'HOW TO READ THIS FILE',
    '  • Executive summary = factual counts in the reporting window (no host-platform analytics).',
    '  • “What likely worked” = qualitative read of the same signals — not proof of audience lift.',
    '  • Before/after = how PodSignal observes prep vs. link distribution; still not Spotify/Apple plays.',
    '  • Sections labeled PROXY or directional are operational hints, not reach metrics.',
    '',
    `Generated (UTC): ${report.generatedAt}`,
    `Reporting window: last ${report.windowDays} days`,
    '',
    '— EXECUTIVE SUMMARY —',
    report.narrative.headline,
    report.narrative.body,
    '',
    '— WHAT LIKELY WORKED (QUALITATIVE · NOT CAUSAL) —',
    report.likelyWorkedNarrative,
    '',
    '— BEFORE / AFTER LAUNCH (PODSIGNAL-OBSERVED) —',
    report.beforeAfterNarrative,
    '',
    '— WORKSPACE SNAPSHOT (OBSERVED / PROXY) —',
    `Shows in workspace: ${report.workspace.shows}`,
    `Active campaigns (status ACTIVE): ${report.workspace.activeCampaigns}`,
    `Launch checklist tasks done / total (proxy for ops follow-through): ${report.workspace.launchTasksDone} / ${report.workspace.launchTasksTotal}`,
    `Launch packs approved in-app (observed events): ${report.launchPackApprovalsObserved}`,
    '',
    '— METRICS BY EVIDENCE LAYER —',
    'OBSERVED (directly recorded in PodSignal):',
    ...report.evidenceGuide.observed.map((s) => `  • ${s}`),
    '',
    'PROXY (directional, not audience proof):',
    ...report.evidenceGuide.proxy.map((s) => `  • ${s}`),
    '',
    'ESTIMATED (not used in this report unless noted):',
    ...report.evidenceGuide.estimated.map((s) => `  • ${s}`),
    '',
    'UNSUPPORTED (do not claim without external data):',
    ...report.evidenceGuide.unsupported.map((s) => `  • ${s}`),
    '',
    '— OBSERVED OUTPUT USAGE (EVENT COUNTS) —',
    `Total usage events in window: ${report.outputUsageEventTotal}`,
    ...Object.entries(report.outputUsageByType)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `  ${k}: ${v}`),
    '',
    `Trackable short-link clicks (observed redirects): ${report.trackableLinkClicksObserved}`,
    '',
    '— CLICKS BY EPISODE (OBSERVED) —',
    ...(report.clicksByEpisode.length === 0
      ? ['  (none yet — create links from Episode launch)']
      : report.clicksByEpisode.map(
          (r) => `  ${r.episodeTitle}: ${r.clicks} clicks [${r.evidence}]`,
        )),
    '',
    '— CLOSING —',
    'This export is a point-in-time record of PodSignal-observed events and redirect hits. ',
    'It is suitable to share with partners when you explain that listener and ad numbers live elsewhere unless you attach them.',
    'PodSignal does not infer causality between in-app activity and third-party growth from this file alone.',
    '',
    '══════════════════════════════════════════════════════════════',
  ];
  return lines.join('\n');
}

/**
 * Premium launch proof — shareable text export grounded in observed + labeled evidence.
 */
export function SponsorReportsPlaceholder() {
  const [report, setReport] = useState<PodsignalReportSummary | null>(null);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const loadReport = useCallback((fromUserAction?: boolean) => {
    setLoadError('');
    if (fromUserAction) setRefreshing(true);
    fetchPodsignalReportSummary()
      .then(setReport)
      .catch((err: unknown) => {
        const ax = err as { response?: { status?: number; data?: { code?: string; migrationHint?: string } } };
        if (ax.response?.status === 503 && ax.response.data?.code === 'PODSIGNAL_PILOT_SCHEMA_MISSING') {
          setLoadError(
            `Pilot schema missing: ${ax.response.data.migrationHint ?? 'Run npm run db:apply-0013'}`,
          );
        } else {
          setLoadError('Could not load report data.');
        }
      })
      .finally(() => {
        if (fromUserAction) setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    void loadReport(false);
  }, [loadReport]);

  useEffect(() => {
    void trackOutputUsage({
      eventType: 'sponsor_report_page_viewed',
      dedupeSessionKey: 'sponsor_report_page',
    });
  }, []);

  const exportProof = () => {
    if (!report) return;
    const text = formatExportDocument(report);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `podsignal-launch-proof-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    void trackOutputUsage({
      eventType: 'sponsor_one_pager_exported',
      payload: { format: 'txt', windowDays: report.windowDays },
    });
  };

  const exportPdf = async () => {
    setPdfLoading(true);
    try {
      await downloadPodsignalSponsorReportPdf();
    } catch {
      setLoadError('Could not download PDF. Ensure pilot migrations are applied and try again.');
    } finally {
      setPdfLoading(false);
    }
  };

  const topUsage = report
    ? Object.entries(report.outputUsageByType).sort((a, b) => b[1] - a[1]).slice(0, 8)
    : [];

  return (
    <div className="ps-page">
      <MeasurementHonestyBanner />
      <div className="ps-page-head">
        <div>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 4px' }}>PodSignal · Pilot-ready</p>
          <h1 className="ps-page-title">Launch proof report</h1>
          <p className="ps-page-sub">
            {report
              ? `Rolling ${report.windowDays}-day window · ${new Date(report.generatedAt).toLocaleString()}`
              : 'Loading workspace-observed activity…'}
          </p>
        </div>
        <div className="pilot-report-toolbar">
          <span className="ps-badge ps-badge--green">Observed · proxy · labeled</span>
          <button
            type="button"
            className="ps-btn-outline"
            disabled={refreshing}
            onClick={() => void loadReport(true)}
            data-testid="pilot-report-refresh"
          >
            {refreshing ? 'Refreshing…' : 'Refresh numbers'}
          </button>
          <button type="button" className="ps-btn-primary" disabled={!report} onClick={() => exportProof()}>
            Export shareable proof (TXT)
          </button>
          <button
            type="button"
            className="ps-btn-outline"
            disabled={!report || pdfLoading}
            onClick={() => void exportPdf()}
            data-testid="pilot-report-download-pdf"
          >
            {pdfLoading ? 'Preparing PDF…' : 'Download PDF proof'}
          </button>
        </div>
      </div>

      <p className="pilot-report-flow-hint">
        <strong style={{ color: '#374151' }}>Suggested read order:</strong> executive summary → what likely worked (qualitative)
        → before/after narrative → KPIs and evidence layers. Export produces the same sections as plain text for email or drive.
      </p>

      {loadError ? (
        <div
          className="ps-card"
          style={{
            borderLeft: '4px solid #dc2626',
            background: '#fef2f2',
            color: '#991b1b',
            fontSize: 14,
          }}
        >
          <strong>Report unavailable.</strong> {loadError}
        </div>
      ) : null}

      {report ? (
        <>
          <section className="pilot-report-hero" aria-labelledby="pilot-report-hero-title">
            <p className="pilot-report-hero-kicker">Launch & sponsor proof</p>
            <h2 id="pilot-report-hero-title" className="pilot-report-hero-title">
              Executive summary
            </h2>
            <p className="pilot-report-hero-lead">
              <strong>{report.narrative.headline}.</strong> {report.narrative.body}
            </p>
          </section>

          <section
            className="ps-card pilot-report-workspace-snapshot"
            style={{ marginBottom: 16 }}
            aria-labelledby="pilot-workspace-snapshot-title"
          >
            <h2
              id="pilot-workspace-snapshot-title"
              style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px', color: '#111827' }}
            >
              Workspace snapshot
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: '#4b5563', lineHeight: 1.6 }}>
              <strong>{report.workspace.shows}</strong> show{report.workspace.shows === 1 ? '' : 's'} ·{' '}
              <strong>{report.workspace.activeCampaigns}</strong> active campaign
              {report.workspace.activeCampaigns === 1 ? '' : 's'} · Checklist{' '}
              <strong>
                {report.workspace.launchTasksDone}/{report.workspace.launchTasksTotal}
              </strong>{' '}
              (proxy). Same figures appear in the text export.
            </p>
          </section>

          <section className="ps-card" style={{ marginBottom: 16 }}>
            <p className="pilot-report-section-label">What likely worked (qualitative · not causal)</p>
            <blockquote className="pilot-report-blockquote">{report.likelyWorkedNarrative}</blockquote>
            <p className="pilot-report-prose" style={{ marginTop: 12, fontSize: 13, color: '#6b7280' }}>
              This paragraph summarizes patterns in <em>PodSignal-observed</em> activity only. It does not claim that assets
              caused downloads, subscribers, or revenue.
            </p>
          </section>

          <section className="ps-card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px', color: '#111827' }}>
              Before / after launch (observed framing)
            </h2>
            <pre className="pilot-report-pre">{report.beforeAfterNarrative}</pre>
          </section>

          <div className="ps-kpi-grid">
            <div className="ps-kpi">
              <div className="ps-kpi-label">Short-link clicks (observed)</div>
              <div className="ps-kpi-value" data-testid="pilot-report-trackable-clicks">
                {report.trackableLinkClicksObserved}
              </div>
              <div className="ps-kpi-meta" style={{ color: '#6b7280' }}>
                PodSignal redirect only
              </div>
            </div>
            <div className="ps-kpi">
              <div className="ps-kpi-label">Usage events (observed)</div>
              <div className="ps-kpi-value">{report.outputUsageEventTotal}</div>
              <div className="ps-kpi-meta" style={{ color: '#6b7280' }}>
                Copies, exports, checklist, etc.
              </div>
            </div>
            <div className="ps-kpi">
              <div className="ps-kpi-label">Launch packs approved</div>
              <div className="ps-kpi-value">{report.launchPackApprovalsObserved}</div>
              <div className="ps-kpi-meta" style={{ color: '#6b7280' }}>
                In-app recorded
              </div>
            </div>
            <div className="ps-kpi">
              <div className="ps-kpi-label">Checklist done / total</div>
              <div className="ps-kpi-value" style={{ fontSize: 22 }}>
                {report.workspace.launchTasksDone}/{report.workspace.launchTasksTotal}
              </div>
              <div className="ps-kpi-meta" style={{ color: '#6b7280' }}>
                Proxy — directional ops signal
              </div>
            </div>
          </div>

          <section className="ps-card" style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px', color: '#111827' }}>
              Evidence guide
            </h2>
            <div style={{ display: 'grid', gap: 14, fontSize: 14, color: '#4b5563' }}>
              <div>
                <strong style={{ color: '#059669' }}>Observed</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {report.evidenceGuide.observed.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong style={{ color: '#d97706' }}>Proxy</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {report.evidenceGuide.proxy.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong style={{ color: '#6366f1' }}>Estimated</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {report.evidenceGuide.estimated.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong style={{ color: '#6b7280' }}>Unsupported</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {report.evidenceGuide.unsupported.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="ps-card" style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px', color: '#111827' }}>
              Output usage (top types)
            </h2>
            <ul style={{ margin: 0, paddingLeft: 18, color: '#4b5563', fontSize: 14, lineHeight: 1.7 }}>
              {topUsage.length === 0 ? (
                <li>No usage events in this window yet — use copy buttons and launch checklist on episode pages.</li>
              ) : (
                topUsage.map(([k, v]) => (
                  <li key={k}>
                    <code style={{ fontSize: 13 }}>{k}</code>: {v}
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="ps-card" style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px', color: '#111827' }}>
              Clicks by episode (observed)
            </h2>
            <div className="ps-table-wrap">
              <table className="ps-table">
                <thead>
                  <tr>
                    <th>Episode</th>
                    <th>Clicks</th>
                    <th>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {report.clicksByEpisode.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ color: '#6b7280', fontSize: 14 }}>
                        No trackable link clicks yet — create links from the episode launch page.
                      </td>
                    </tr>
                  ) : (
                    report.clicksByEpisode.map((row) => (
                      <tr key={row.episodeId}>
                        <td style={{ fontWeight: 600 }}>{row.episodeTitle}</td>
                        <td>{row.clicks}</td>
                        <td style={{ fontSize: 13, color: '#6b7280' }}>{row.evidence}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        !loadError && <p style={{ color: '#6b7280' }}>Loading…</p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
        <Link to="/analytics" className="ps-btn-outline" style={{ textDecoration: 'none' }}>
          Open analytics
        </Link>
        <Link to="/shows" className="ps-btn-primary" style={{ textDecoration: 'none' }}>
          Go to shows
        </Link>
      </div>
    </div>
  );
}
