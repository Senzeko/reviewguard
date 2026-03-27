import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { fetchPodcast, fetchEpisodes, createEpisode } from '../api/client';
import type { Podcast, Episode } from '../types/podsignal';

export function ShowDetailPage() {
  const { podcastId } = useParams<{ podcastId: string }>();
  const navigate = useNavigate();
  const [podcast, setPodcast] = useState<Podcast | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    if (!podcastId) return;
    setError('');
    setLoading(true);
    Promise.all([fetchPodcast(podcastId), fetchEpisodes({ podcastId, limit: 50 })])
      .then(([p, list]) => {
        setPodcast(p);
        setEpisodes(list.episodes);
      })
      .catch((e) => setError(e.response?.data?.error ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }, [podcastId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreateEpisode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podcastId || !title.trim()) return;
    setCreating(true);
    setError('');
    try {
      const ep = await createEpisode({ podcastId, title: title.trim() });
      setTitle('');
      navigate(`/episodes/${ep.id}`);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? 'Could not create episode');
    } finally {
      setCreating(false);
    }
  };

  if (!podcastId) return <p style={{ color: '#6b7280' }}>Missing show id.</p>;

  if (loading) return <p style={{ color: '#6b7280' }}>Loading...</p>;

  if (!podcast) {
    return (
      <div>
        <p style={{ color: '#dc2626' }}>{error || 'Show not found.'}</p>
        <Link to="/shows" style={{ color: '#6d28d9', fontWeight: 600 }}>
          ← Back to shows
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <Link to="/shows" style={styles.navLink}>
          ← All shows
        </Link>
      </div>

      <section style={styles.heroCard}>
        <div>
          <h1 style={styles.title}>{podcast.title}</h1>
          <p style={styles.subtitle}>
            {podcast.description || 'Manage episodes and launch campaigns for this show.'}
          </p>
        </div>
        <div style={styles.countPill}>{episodes.length} episodes</div>
      </section>

      {error ? (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            padding: '12px 14px',
            borderRadius: 8,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      ) : null}

      <section style={styles.card}>
        <h3 style={{ fontSize: 16, color: '#111827', margin: '0 0 12px' }}>Create episode</h3>
        <form onSubmit={handleCreateEpisode} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New episode title"
          style={styles.input}
        />
        <button
          type="submit"
          disabled={creating || !title.trim()}
          style={{ ...styles.addBtn, opacity: creating || !title.trim() ? 0.6 : 1 }}
        >
          {creating ? 'Adding…' : 'Add episode'}
        </button>
        </form>
      </section>

      {episodes.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No episodes yet.</p>
      ) : (
        <section style={styles.card}>
          <h3 style={{ fontSize: 16, color: '#111827', margin: '0 0 10px' }}>Episodes</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {episodes.map((ep) => (
            <li key={ep.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <button
                type="button"
                onClick={() => navigate(`/episodes/${ep.id}`)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%',
                  textAlign: 'left',
                  padding: '12px 8px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: 14,
                  color: '#111827',
                }}
              >
                <span>{ep.title}</span>
                <span
                  style={{
                    fontSize: 11,
                    borderRadius: 999,
                    padding: '3px 8px',
                    textTransform: 'uppercase',
                    background:
                      ep.status === 'FAILED'
                        ? '#fee2e2'
                        : ep.status === 'PROCESSING'
                          ? '#e0e7ff'
                          : '#ecfdf5',
                    color:
                      ep.status === 'FAILED'
                        ? '#b91c1c'
                        : ep.status === 'PROCESSING'
                          ? '#4338ca'
                          : '#065f46',
                  }}
                >
                  {ep.status}
                </span>
              </button>
            </li>
          ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  navLink: { color: '#6d28d9', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
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
  title: { fontSize: 34, lineHeight: 1.1, margin: 0, color: '#111827' },
  subtitle: { margin: '8px 0 0', color: '#6b7280', fontSize: 14 },
  countPill: {
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 999,
    padding: '8px 12px',
    fontSize: 12,
    color: '#4b5563',
    fontWeight: 600,
  },
  card: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 14,
  },
  input: {
    flex: '1 1 260px',
    minWidth: 220,
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    background: '#f9fafb',
    color: '#111827',
    fontSize: 14,
  },
  addBtn: {
    padding: '10px 16px',
    background: '#6d28d9',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
