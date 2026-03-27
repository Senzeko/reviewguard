import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchPodcasts, createPodcast } from '../api/client';
import type { Podcast } from '../types/podsignal';

export function ShowsPage() {
  const navigate = useNavigate();
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setError('');
    fetchPodcasts()
      .then((r) => setPodcasts(r.podcasts))
      .catch((e) => setError(e.response?.data?.error ?? 'Failed to load shows'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    setError('');
    try {
      const p = await createPodcast({ title: title.trim() });
      setTitle('');
      navigate(`/shows/${p.id}`);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? 'Could not create show');
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <p style={{ color: '#6b7280' }}>Loading shows...</p>;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 20,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ fontSize: 34, lineHeight: 1.1, margin: 0, color: '#111827' }}>Shows</h2>
          <p style={{ color: '#6b7280', marginTop: 6, fontSize: 14 }}>
            Manage podcasts and create episodes for launch workflows.
          </p>
        </div>
        <div
          style={{
            alignSelf: 'center',
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: 999,
            padding: '8px 12px',
            fontSize: 12,
            color: '#4b5563',
          }}
        >
          {podcasts.length} total shows
        </div>
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

      <form
        onSubmit={handleCreate}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 16,
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New show title"
          style={{
            flex: '1 1 220px',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            background: '#f9fafb',
            color: '#111827',
            fontSize: 14,
          }}
        />
        <button
          type="submit"
          disabled={creating || !title.trim()}
          style={{
            padding: '10px 16px',
            background: '#6d28d9',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontWeight: 600,
            cursor: creating ? 'wait' : 'pointer',
            opacity: creating || !title.trim() ? 0.6 : 1,
          }}
        >
          {creating ? 'Creating…' : 'Create show'}
        </button>
      </form>

      {podcasts.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No shows yet. Add a title above to create your first one.</p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          {podcasts.map((p) => (
            <li key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <button
                type="button"
                onClick={() => navigate(`/shows/${p.id}`)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '14px 16px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: 15,
                  color: '#111827',
                }}
              >
                {p.title}
                {p.description ? (
                  <span style={{ display: 'block', fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                    {p.description}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
