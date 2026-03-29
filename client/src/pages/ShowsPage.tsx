import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchPodcasts, createPodcast } from '../api/client';
import type { Podcast } from '../types/podsignal';
import { loadDraft, removeDraft, saveDraft } from '../lib/draftStorage';
import './ShowsPage.css';

export function ShowsPage() {
  const navigate = useNavigate();
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [draftNote, setDraftNote] = useState(false);
  const createLockRef = useRef(false);

  useEffect(() => {
    const d = loadDraft<{ title: string }>('shows_new_title');
    if (d?.value.title?.trim()) {
      setTitle(d.value.title);
      setDraftNote(true);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const x = title.trim();
      if (x.length > 0) saveDraft('shows_new_title', { title });
      else removeDraft('shows_new_title');
    }, 400);
    return () => window.clearTimeout(t);
  }, [title]);

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
    if (!title.trim() || createLockRef.current) return;
    createLockRef.current = true;
    setCreating(true);
    setError('');
    try {
      const p = await createPodcast({ title: title.trim() });
      removeDraft('shows_new_title');
      setDraftNote(false);
      setTitle('');
      navigate(`/shows/${p.id}`);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? 'Could not create show');
    } finally {
      setCreating(false);
      createLockRef.current = false;
    }
  };

  if (loading) {
    return (
      <div className="shows-page">
        <p className="shows-empty">Loading shows…</p>
      </div>
    );
  }

  return (
    <div className="shows-page">
      <section className="shows-hero">
        <div>
          <h1>Shows</h1>
          <p>Manage podcasts, episodes, and launch campaigns in one place.</p>
        </div>
        <div className="shows-pill">{podcasts.length} total shows</div>
      </section>

      {error ? <div className="shows-error">{error}</div> : null}
      {draftNote ? (
        <p className="shows-draft-note" style={{ fontSize: 13, color: '#065f46', margin: '0 0 8px' }}>
          Restored unsaved show title from this session.
          <button
            type="button"
            onClick={() => {
              setDraftNote(false);
              removeDraft('shows_new_title');
            }}
            style={{ marginLeft: 8, fontSize: 13, cursor: 'pointer' }}
          >
            Clear
          </button>
        </p>
      ) : null}

      <form className="shows-create" onSubmit={handleCreate}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New show title"
          aria-label="New show title"
        />
        <button type="submit" disabled={creating || !title.trim()}>
          {creating ? 'Creating…' : 'Create show'}
        </button>
      </form>

      {podcasts.length === 0 ? (
        <p className="shows-empty">No shows yet. Add a title above to create your first one.</p>
      ) : (
        <ul className="shows-grid">
          {podcasts.map((p) => (
            <li key={p.id}>
              <button type="button" className="shows-card" onClick={() => navigate(`/shows/${p.id}`)}>
                <div className="shows-card-cover" />
                <div className="shows-card-body">
                  <div className="shows-card-title">{p.title}</div>
                  {p.description ? <p className="shows-card-desc">{p.description}</p> : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
