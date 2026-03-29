import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchWorkspaceEpisodes } from '../api/client';
import { getUserFacingApiError } from '../api/userFacingError';
import type { Episode } from '../types/podsignal';
import './podsignal-pages.css';

const PAGE_SIZE = 50;

type Row = Episode & { podcastTitle: string };

function statusLabel(status: string): { label: string; className: string } {
  const s = status.toUpperCase();
  if (s === 'PUBLISHED') return { label: 'Published', className: 'ps-badge--green' };
  if (s === 'READY') return { label: 'Scheduled', className: 'ps-badge--blue' };
  if (s === 'PROCESSING') return { label: 'Processing', className: 'ps-badge--purple' };
  if (s === 'FAILED') return { label: 'Failed', className: 'ps-badge--red' };
  return { label: 'Draft', className: 'ps-badge--gray' };
}

export function EpisodesListPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const loadInitial = useCallback(() => {
    setError('');
    setLoading(true);
    fetchWorkspaceEpisodes({ limit: PAGE_SIZE, offset: 0 })
      .then(({ episodes, total: t }) => {
        const sorted = [...episodes].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setRows(sorted);
        setTotal(t);
      })
      .catch((e) => setError(getUserFacingApiError(e, 'Failed to load episodes')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const loadMore = useCallback(() => {
    if (loadingMore || rows.length >= total) return;
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
  }, [loadingMore, rows.length, total]);

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
                      <td style={{ fontWeight: 600, color: '#9ca3af' }} title="Coming later">
                        —
                      </td>
                      <td>
                        <span className="ps-badge ps-badge--gray" title="Use Episodes → Launch on the episode">
                          —
                        </span>
                      </td>
                      <td style={{ color: '#9ca3af', fontSize: 13 }}>—</td>
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
