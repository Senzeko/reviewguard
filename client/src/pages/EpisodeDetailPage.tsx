import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  fetchEpisode,
  patchEpisode,
  deleteEpisode,
  processEpisode,
  uploadEpisodeAudio,
} from '../api/client';
import type { EpisodeDetail } from '../types/podsignal';

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}:${rs.toString().padStart(2, '0')}`;
}

export function EpisodeDetailPage() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const navigate = useNavigate();
  const [episode, setEpisode] = useState<EpisodeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const episodeIdRef = useRef<string | undefined>(episodeId);

  episodeIdRef.current = episodeId;

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!episodeId) return;
      if (!opts?.silent) setLoading(true);
      setError('');
      try {
        const e = await fetchEpisode(episodeId);
        setEpisode({
          ...e,
          transcriptSegments: e.transcriptSegments ?? [],
        });
        setTitle(e.title);
        setAudioUrl(e.audioUrl ?? '');
      } catch (err: unknown) {
        const er = err as { response?: { data?: { error?: string } } };
        setError(er.response?.data?.error ?? 'Failed to load episode');
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [episodeId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!episodeId) return;
    const es = new EventSource('/api/sse/events');

    const onReady = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data as string) as { episodeId?: string };
        if (data.episodeId === episodeIdRef.current) void load({ silent: true });
      } catch {
        /* ignore */
      }
    };

    const onFailed = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data as string) as { episodeId?: string };
        if (data.episodeId === episodeIdRef.current) void load({ silent: true });
      } catch {
        /* ignore */
      }
    };

    es.addEventListener('episode:ready', onReady);
    es.addEventListener('episode:failed', onFailed);
    return () => {
      es.removeEventListener('episode:ready', onReady);
      es.removeEventListener('episode:failed', onFailed);
      es.close();
    };
  }, [episodeId, load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!episodeId || !title.trim()) return;
    setSaving(true);
    setError('');
    try {
      const updated = await patchEpisode(episodeId, {
        title: title.trim(),
        audioUrl: audioUrl.trim() || undefined,
      });
      setEpisode((prev) =>
        prev
          ? {
              ...prev,
              ...updated,
              signals: prev.signals,
              clips: prev.clips,
              transcriptSegments: prev.transcriptSegments,
            }
          : prev,
      );
      setAudioUrl(updated.audioUrl ?? '');
    } catch (err: unknown) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleProcess = async () => {
    if (!episodeId) return;
    setProcessing(true);
    setError('');
    try {
      await processEpisode(episodeId);
      await load({ silent: true });
    } catch (err: unknown) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? 'Could not start processing');
    } finally {
      setProcessing(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !episodeId) return;
    setUploading(true);
    setError('');
    try {
      const res = await uploadEpisodeAudio(episodeId, file);
      setEpisode((prev) =>
        prev ? { ...prev, ...res.episode, transcriptSegments: prev.transcriptSegments } : prev,
      );
    } catch (err: unknown) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async () => {
    if (!episodeId || !episode) return;
    if (!window.confirm('Delete this episode? This cannot be undone.')) return;
    setDeleting(true);
    setError('');
    try {
      await deleteEpisode(episodeId);
      navigate(`/shows/${episode.podcastId}`);
    } catch (err: unknown) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  if (!episodeId) return <p style={{ color: '#6b7280' }}>Missing episode id.</p>;

  if (loading) return <p style={{ color: '#6b7280' }}>Loading episode...</p>;

  if (!episode) {
    return (
      <div>
        <p style={{ color: '#dc2626' }}>{error || 'Episode not found.'}</p>
        <Link to="/shows" style={{ color: '#6d28d9', fontWeight: 600 }}>
          ← Shows
        </Link>
      </div>
    );
  }

  const hasAudio =
    (episode.audioLocalRelPath && episode.audioLocalRelPath.length > 0) ||
    (episode.audioUrl && episode.audioUrl.trim().startsWith('http'));

  const canProcess =
    hasAudio &&
    episode.status !== 'PROCESSING' &&
    episode.status !== 'ARCHIVED' &&
    episode.status !== 'PUBLISHED';

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <Link to={`/shows/${episode.podcastId}`} style={styles.navLink}>
          ← Back to show
        </Link>
        <Link to={`/episodes/${episodeId}/launch`} style={styles.navLink}>
          Launch checklist →
        </Link>
      </div>

      <section style={styles.heroCard}>
        <div>
          <h1 style={styles.title}>{episode.title}</h1>
          <p style={styles.subtitle}>Episode workspace and transcription controls</p>
        </div>
        <span
          style={{
            ...styles.statusPill,
            background:
              episode.status === 'FAILED'
                ? '#fee2e2'
                : episode.status === 'PROCESSING'
                  ? '#e0e7ff'
                  : '#ecfdf5',
            color:
              episode.status === 'FAILED'
                ? '#b91c1c'
                : episode.status === 'PROCESSING'
                  ? '#4338ca'
                  : '#065f46',
          }}
        >
          {episode.status}
        </span>
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

      {episode.status === 'FAILED' && episode.processingError && (
        <div
          style={{
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            color: '#7c2d12',
            padding: '12px 14px',
            borderRadius: 8,
            fontSize: 14,
            textAlign: 'left',
          }}
        >
          <strong>Processing failed.</strong>
          <pre
            style={{
              margin: '8px 0 0',
              whiteSpace: 'pre-wrap',
              fontSize: 13,
              color: '#9a3412',
            }}
          >
            {episode.processingError}
          </pre>
        </div>
      )}

      <section style={styles.card}>
        <form onSubmit={handleSave}>
          <label style={styles.label}>Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={styles.input}
        />

        <label style={styles.label}>
          Audio URL (HTTPS)
        </label>
        <input
          value={audioUrl}
          onChange={(e) => setAudioUrl(e.target.value)}
          placeholder="https://example.com/episode.mp3"
          style={styles.input}
        />

        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12, textAlign: 'left' }}>
          Or upload a file (mp3, wav, m4a, webm, ogg, mp4):
        </p>
        <label
          style={styles.uploadBtn}
        >
          <input
            type="file"
            accept=".mp3,.wav,.m4a,.webm,.ogg,.mp4,audio/*"
            style={{ display: 'none' }}
            onChange={(e) => void handleUpload(e)}
            disabled={uploading}
          />
          {uploading ? 'Uploading…' : 'Choose audio file'}
        </label>
        {episode.audioLocalRelPath ? (
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
            Stored: <code style={{ fontSize: 12 }}>{episode.audioLocalRelPath}</code>
          </p>
        ) : null}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 4 }}>
          <button
            type="submit"
            disabled={saving}
            style={styles.primaryBtn}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => void handleProcess()}
            disabled={processing || !canProcess}
            title={!hasAudio ? 'Add audio URL or upload a file first' : undefined}
            style={{
              padding: '10px 16px',
              background: canProcess ? '#0d9488' : '#9ca3af',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              cursor: processing || !canProcess ? 'not-allowed' : 'pointer',
              opacity: canProcess ? 1 : 0.7,
            }}
          >
            {episode.status === 'PROCESSING'
              ? 'Processing…'
              : processing
                ? 'Starting…'
                : 'Run transcription'}
          </button>
        </div>
        </form>
      </section>

      <section style={styles.card}>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: '140px 1fr',
            gap: '8px 16px',
            fontSize: 14,
            color: '#6b7280',
          }}
        >
        <dt>Status</dt>
          <dd style={{ margin: 0, color: '#111827' }}>{episode.status}</dd>
        <dt>Signals</dt>
        <dd style={{ margin: 0 }}>{Array.isArray(episode.signals) ? episode.signals.length : 0}</dd>
        <dt>Clips</dt>
        <dd style={{ margin: 0 }}>{Array.isArray(episode.clips) ? episode.clips.length : 0}</dd>
        <dt>Segments</dt>
        <dd style={{ margin: 0 }}>{episode.transcriptSegments?.length ?? 0}</dd>
        </dl>
      </section>

      {episode.transcript && (
        <section style={styles.card}>
          <h3 style={{ fontSize: 16, color: '#111827', marginBottom: 8 }}>Transcript</h3>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              fontSize: 13,
              padding: 14,
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              background: '#f9fafb',
              color: '#374151',
              maxHeight: 240,
              overflow: 'auto',
            }}
          >
            {episode.transcript}
          </pre>
          {episode.summary ? (
            <p style={{ fontSize: 14, color: '#4b5563', marginTop: 12 }}>
              <strong style={{ color: '#111827' }}>Summary:</strong> {episode.summary}
            </p>
          ) : null}
        </section>
      )}

      {episode.transcriptSegments && episode.transcriptSegments.length > 0 && (
        <section style={styles.card}>
          <h3 style={{ fontSize: 16, color: '#111827', marginBottom: 8 }}>Timed segments</h3>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
                border: '1px solid #e5e7eb',
              }}
            >
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={{ padding: 8, textAlign: 'left' }}>Start</th>
                  <th style={{ padding: 8, textAlign: 'left' }}>End</th>
                  <th style={{ padding: 8, textAlign: 'left' }}>Text</th>
                </tr>
              </thead>
              <tbody>
                {episode.transcriptSegments.map((s) => (
                  <tr key={s.id}>
                    <td style={{ padding: 8, borderTop: '1px solid #f3f4f6', color: '#6b7280' }}>
                      {formatMs(s.startMs)}
                    </td>
                    <td style={{ padding: 8, borderTop: '1px solid #f3f4f6', color: '#6b7280' }}>
                      {formatMs(s.endMs)}
                    </td>
                    <td
                      style={{
                        padding: 8,
                        borderTop: '1px solid #f3f4f6',
                        color: '#111827',
                      }}
                    >
                      {s.text}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section style={styles.card}>
        <p style={{ fontSize: 13, color: '#6b7280', margin: 0, textAlign: 'left' }}>
        Set <code>TRANSCRIPTION_PROVIDER=assemblyai</code> and <code>ASSEMBLYAI_API_KEY</code> on the
        server for real ASR; <code>stub</code> returns placeholder text without calling AssemblyAI.
        </p>
      </section>

      <button
        type="button"
        onClick={() => void handleDelete()}
        disabled={deleting}
        style={styles.deleteBtn}
      >
        {deleting ? 'Deleting…' : 'Delete episode'}
      </button>
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
  statusPill: {
    borderRadius: 999,
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 700,
    border: '1px solid transparent',
  },
  card: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 14,
  },
  label: { display: 'block', fontSize: 13, color: '#4b5563', marginBottom: 6, fontWeight: 600 },
  input: {
    width: '100%',
    maxWidth: 560,
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    background: '#f9fafb',
    color: '#111827',
    fontSize: 14,
    marginBottom: 12,
    boxSizing: 'border-box',
  },
  uploadBtn: {
    display: 'inline-block',
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    background: '#fff',
    cursor: 'pointer',
    fontSize: 14,
    marginBottom: 16,
  },
  primaryBtn: {
    padding: '10px 16px',
    background: '#6d28d9',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    fontWeight: 600,
    cursor: 'pointer',
  },
  deleteBtn: {
    padding: '10px 16px',
    background: 'transparent',
    color: '#dc2626',
    border: '1px solid rgba(220, 38, 38, 0.35)',
    borderRadius: 8,
    cursor: 'pointer',
    justifySelf: 'start',
  },
};
