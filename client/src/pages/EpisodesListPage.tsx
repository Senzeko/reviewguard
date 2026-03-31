import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchEpisodeCampaign, fetchEpisodes, fetchPodcasts, fetchWorkspaceEpisodes } from '../api/client';
import { getUserFacingApiError } from '../api/userFacingError';
import type { Episode } from '../types/podsignal';
import './podsignal-pages.css';

const PAGE_SIZE = 50;

type Row = Episode & { podcastTitle: string };
type CampaignSnapshot = { status: string; launchStatus: string | null };

function statusLabel(status: string): { label: string; className: string } {
  const s = status.toUpperCase();
  if (s === 'PUBLISHED') return { label: 'Published', className: 'ps-badge--green' };
  if (s === 'READY') return { label: 'Scheduled', className: 'ps-badge--blue' };
  if (s === 'PROCESSING') return { label: 'Processing', className: 'ps-badge--purple' };
  if (s === 'FAILED') return { label: 'Failed', className: 'ps-badge--red' };
  return { label: 'Draft', className: 'ps-badge--gray' };
}

function campaignStatusLabel(status?: string): { label: string; className: string } {
  const s = (status ?? 'DRAFT').toUpperCase();
  if (s === 'ACTIVE') return { label: 'Active', className: 'ps-badge--purple' };
  if (s === 'COMPLETED') return { label: 'Completed', className: 'ps-badge--green' };
  if (s === 'ARCHIVED') return { label: 'Archived', className: 'ps-badge--gray' };
  return { label: 'Draft', className: 'ps-badge--gray' };
}

function launchStatusLabel(status?: string | null): { label: string; className: string } {
  const s = (status ?? '').toLowerCase();
  if (s === 'approved') return { label: 'Approved', className: 'ps-badge--green' };
  if (s === 'exported') return { label: 'Exported', className: 'ps-badge--blue' };
  if (s === 'measured') return { label: 'Measured', className: 'ps-badge--purple' };
  if (s === 'draft') return { label: 'Draft', className: 'ps-badge--gray' };
  return { label: 'In prep', className: 'ps-badge--gray' };
}

export function EpisodesListPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [usingFallback, setUsingFallback] = useState(false);
  const [campaignByEpisode, setCampaignByEpisode] = useState<Record<string, CampaignSnapshot>>({});

  const loadFallbackByShows = useCallback(async (): Promise<{ episodes: Row[]; total: number }> => {
    const { podcasts } = await fetchPodcasts();
    if (podcasts.length === 0) return { episodes: [], total: 0 };

    const pages = await Promise.all(
      podcasts.map(async (p) => {
        const data = await fetchEpisodes({ podcastId: p.id, limit: 100, offset: 0 });
        return data.episodes.map((ep) => ({ ...ep, podcastTitle: p.title }));
      }),
    );

    const merged = pages.flat();
    const byId = new Map<string, Row>();
    for (const row of merged) byId.set(row.id, row);
    const sorted = [...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { episodes: sorted, total: sorted.length };
  }, []);

  const loadInitial = useCallback(() => {
    setError('');
    setLoading(true);
    setUsingFallback(false);
    fetchWorkspaceEpisodes({ limit: PAGE_SIZE, offset: 0 })
      .then(async ({ episodes, total: t }) => {
        const safeEpisodes = Array.isArray(episodes) ? episodes : [];
        const hasRowData = safeEpisodes.some((e) => typeof e?.podcastTitle === 'string');
        if (safeEpisodes.length === 0 || !hasRowData) {
          const fallback = await loadFallbackByShows();
          setRows(fallback.episodes);
          setTotal(fallback.total);
          setUsingFallback(true);
          return;
        }
        const sorted = [...safeEpisodes].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setRows(sorted);
        setTotal(typeof t === 'number' ? t : sorted.length);
      })
      .catch((e) => setError(getUserFacingApiError(e, 'Failed to load episodes')))
      .finally(() => setLoading(false));
  }, [loadFallbackByShows]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const loadMore = useCallback(() => {
    if (loadingMore || rows.length >= total || usingFallback) return;
    setLoadingMore(true);
    setError('');
    fetchWorkspaceEpisodes({ limit: PAGE_SIZE, offset: rows.length })
      .then(({ episodes, total: t }) => {
        setTotal(t);
        setRows((prev) => {
          const merged = [...prev, ...episodes];
          const byId = new Map<string, Row>();
          for (const r of merged) {
            byId.set(r.id, r as Row);
          }
          return [...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        });
      })
      .catch((e) => setError(getUserFacingApiError(e, 'Failed to load more')))
      .finally(() => setLoadingMore(false));
  }, [loadingMore, rows.length, total, usingFallback]);

  useEffect(() => {
    if (rows.length === 0) {
      setCampaignByEpisode({});
      return;
    }
    let cancelled = false;
    const targetRows = rows.slice(0, PAGE_SIZE);
    void (async () => {
      const entries = await Promise.all(
        targetRows.map(async (row) => {
          try {
            const campaign = await fetchEpisodeCampaign(row.id);
            return [
              row.id,
              {
                status: campaign.status,
                launchStatus:
                  typeof campaign.launchPack?.status === 'string' ? campaign.launchPack.status : null,
              } satisfies CampaignSnapshot,
            ] as const;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      const next: Record<string, CampaignSnapshot> = {};
      for (const e of entries) {
        if (!e) continue;
        next[e[0]] = e[1];
      }
      setCampaignByEpisode(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [rows]);

  const filtered = rows.filter((r) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return r.title.toLowerCase().includes(s) || r.podcastTitle.toLowerCase().includes(s);
  });

  return (
    <div className="ps-page">
      <div className="ps-page-head">
        <div>
          <h1 className="ps-page-title">Episodes</h1>
          <p className="ps-page-sub">Manage and launch episodes across all your shows.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="ps-pill-muted">
            {rows.length}
            {total > rows.length ? ` of ${total}` : ''} episodes
          </span>
          <button type="button" className="ps-btn-primary" onClick={() => navigate('/shows')}>
            + New episode
          </button>
        </div>
      </div>

      <div className="ps-card" style={{ padding: 12 }}>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 10px' }}>
          Search filters your loaded episodes. Show/status/date filters are not available in this build.
          {usingFallback ? ' Loaded via show-by-show fallback mode.' : ''}
        </p>
        <input
          className="ps-input"
          style={{ width: '100%', maxWidth: 420 }}
          placeholder="Search episodes by title or show…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search episodes"
        />
      </div>

      {error ? (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: 12, borderRadius: 8 }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <p style={{ color: '#6b7280' }}>Loading episodes…</p>
      ) : (
        <div className="ps-table-wrap">
          <table className="ps-table">
            <thead>
              <tr>
                <th>Episode</th>
                <th>Show</th>
                <th>Publish</th>
                <th>Status</th>
                <th title="Not wired in this build">Launch</th>
                <th title="Not wired in this build">Campaign</th>
                <th title="Not wired in this build">Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
                    No episodes yet.{' '}
                    <Link to="/shows" style={{ color: '#4f46e5', fontWeight: 600 }}>
                      Create a show
                    </Link>{' '}
                    and add an episode.
                  </td>
                </tr>
              ) : (
                filtered.map((ep) => {
                  const st = statusLabel(ep.status);
                  const campaign = campaignByEpisode[ep.id];
                  const launch = launchStatusLabel(campaign?.launchStatus);
                  const campaignBadge = campaignStatusLabel(campaign?.status);
                  return (
                    <tr
                      key={ep.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/episodes/${ep.id}`)}
                    >
                      <td>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                          <div className="ps-thumb" />
                          <div>
                            <div style={{ fontWeight: 600, color: '#111827' }}>{ep.title}</div>
                            <div style={{ fontSize: 12, color: '#9ca3af' }}>ID {ep.id.slice(0, 8)}…</div>
                          </div>
                        </div>
                      </td>
                      <td>{ep.podcastTitle}</td>
                      <td style={{ color: '#6b7280', fontSize: 13 }}>
                        {ep.publishedAt ? new Date(ep.publishedAt).toLocaleDateString() : '—'}
                      </td>
                      <td>
                        <span className={`ps-badge ${st.className}`}>{st.label}</span>
                      </td>
                      <td>
                        <span className={`ps-badge ${launch.className}`}>{launch.label}</span>
                      </td>
                      <td>
                        <span className={`ps-badge ${campaignBadge.className}`}>
                          {campaignBadge.label}
                        </span>
                      </td>
                      <td style={{ color: '#6b7280', fontSize: 13 }}>
                        {new Date(ep.updatedAt).toLocaleDateString()}
                      </td>
                      <td style={{ textAlign: 'right', color: '#e5e7eb' }} aria-hidden>
                        ⋯
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && total > rows.length ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <button
            type="button"
            className="ps-btn-outline"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            style={{ minWidth: 200 }}
          >
            {loadingMore ? 'Loading…' : `Load more (${total - rows.length} remaining)`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
