import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  fetchEpisode,
  fetchEpisodeCampaign,
  patchEpisodeCampaign,
  addCampaignTask,
  patchCampaignTask,
  deleteCampaignTask,
} from '../api/client';
import type { EpisodeCampaign, CampaignStatus } from '../types/podsignal';

const STATUSES: CampaignStatus[] = ['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED'];

export function EpisodeLaunchPage() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const [episodeTitle, setEpisodeTitle] = useState('');
  const [podcastId, setPodcastId] = useState('');
  const [campaign, setCampaign] = useState<EpisodeCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const episodeIdRef = useRef(episodeId);
  episodeIdRef.current = episodeId;

  const load = useCallback(async () => {
    if (!episodeId) return;
    setLoading(true);
    setError('');
    try {
      const [ep, c] = await Promise.all([fetchEpisode(episodeId), fetchEpisodeCampaign(episodeId)]);
      setEpisodeTitle(ep.title);
      setPodcastId(ep.podcastId);
      setCampaign(c);
    } catch (err: unknown) {
      const er = err as { response?: { data?: { error?: string } } };
      setError(er.response?.data?.error ?? 'Failed to load launch board');
    } finally {
      setLoading(false);
    }
  }, [episodeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!episodeId) return;
    const es = new EventSource('/api/sse/events');
    const onCampaign = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data as string) as { episodeId?: string };
        if (data.episodeId === episodeIdRef.current) void load();
      } catch {
        /* ignore */
      }
    };
    es.addEventListener('campaign:updated', onCampaign);
    return () => {
      es.removeEventListener('campaign:updated', onCampaign);
      es.close();
    };
  }, [episodeId, load]);

  const toggleTask = async (taskId: string, done: boolean) => {
    if (!episodeId) return;
    try {
      const c = await patchCampaignTask(episodeId, taskId, done);
      setCampaign(c);
    } catch {
      /* toast optional */
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!episodeId || !newLabel.trim()) return;
    try {
      const c = await addCampaignTask(episodeId, { label: newLabel.trim() });
      setCampaign(c);
      setNewLabel('');
    } catch {
      /* */
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!episodeId || !window.confirm('Remove this task?')) return;
    try {
      const c = await deleteCampaignTask(episodeId, taskId);
      setCampaign(c);
    } catch {
      /* */
    }
  };

  const handleStatusChange = async (status: CampaignStatus) => {
    if (!episodeId) return;
    setSavingMeta(true);
    try {
      const body: Parameters<typeof patchEpisodeCampaign>[1] = { status };
      if (status === 'ACTIVE' && !campaign?.startedAt) {
        body.startedAt = new Date().toISOString();
      }
      if (status === 'COMPLETED' && !campaign?.completedAt) {
        body.completedAt = new Date().toISOString();
      }
      const c = await patchEpisodeCampaign(episodeId, body);
      setCampaign(c);
    } catch {
      /* */
    } finally {
      setSavingMeta(false);
    }
  };

  const handleUtmBlur = async () => {
    if (!episodeId || !campaign) return;
    const utm = campaign.utmCampaign ?? '';
    setSavingMeta(true);
    try {
      const c = await patchEpisodeCampaign(episodeId, { utmCampaign: utm || null });
      setCampaign(c);
    } catch {
      /* */
    } finally {
      setSavingMeta(false);
    }
  };

  const exportJson = async () => {
    if (!episodeId) return;
    const res = await fetch(`/api/episodes/${episodeId}/campaign/export`, { credentials: 'include' });
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `launch-${episodeId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!episodeId) {
    return <p style={{ color: 'var(--text)' }}>Missing episode id.</p>;
  }

  if (loading) {
    return <p style={{ color: 'var(--text)' }}>Loading launch board…</p>;
  }

  if (error || !campaign) {
    return (
      <div>
        <p style={{ color: '#dc2626' }}>{error || 'Not found.'}</p>
        <Link to="/shows" style={{ color: 'var(--accent)' }}>
          ← Shows
        </Link>
      </div>
    );
  }

  const doneCount = campaign.tasks.filter((t) => t.doneAt).length;
  const total = campaign.tasks.length;
  const progressPct = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <Link to={`/shows/${podcastId}`} style={styles.navLink}>
          ← Show
        </Link>
        <Link to={`/episodes/${episodeId}`} style={styles.navLink}>
          ← Episode
        </Link>
      </div>

      <section style={styles.heroCard}>
        <div>
          <h1 style={styles.title}>Launch Campaign</h1>
          <p style={styles.subtitle}>{episodeTitle}</p>
        </div>
        <div style={styles.statPill}>
          {doneCount}/{total} tasks completed
        </div>
      </section>

      <section style={styles.progressCard}>
        <div style={styles.progressRow}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>Campaign progress</span>
          <strong style={{ fontSize: 13, color: '#111827' }}>{progressPct}%</strong>
        </div>
        <div style={styles.progressTrack}>
          <div style={{ ...styles.progressFill, width: `${progressPct}%` }} />
        </div>
      </section>

      <section style={styles.metaCard}>
        <label style={{ color: '#4b5563', fontSize: 13, fontWeight: 600 }}>
          Status{' '}
          <select
            value={campaign.status}
            disabled={savingMeta}
            onChange={(e) => void handleStatusChange(e.target.value as CampaignStatus)}
            style={styles.select}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section style={styles.metaCard}>
        <label style={{ display: 'block', fontSize: 13, color: '#4b5563', marginBottom: 6, fontWeight: 600 }}>
          UTM campaign name (optional)
        </label>
        <input
          value={campaign.utmCampaign ?? ''}
          onChange={(e) =>
            setCampaign((prev) => (prev ? { ...prev, utmCampaign: e.target.value } : prev))
          }
          onBlur={() => void handleUtmBlur()}
          placeholder="e.g. ep42-march-launch"
          style={styles.input}
        />
      </section>

      <section
        style={{
          background: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: 10,
          padding: '10px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <span style={{ color: '#92400e', fontSize: 13 }}>
          {total - doneCount} pending launch tasks need attention.
        </span>
        <button
          type="button"
          onClick={() => void exportJson()}
          style={styles.exportBtn}
        >
          Export copy bundle (JSON)
        </button>
      </section>

      <section style={styles.metaCard}>
        <h2 style={{ fontSize: 16, margin: '0 0 10px', color: '#111827' }}>Checklist</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {campaign.tasks.map((t) => (
            <li
              key={t.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 0',
                borderBottom: '1px solid #f3f4f6',
              }}
            >
              <input
                type="checkbox"
                checked={!!t.doneAt}
                onChange={(e) => void toggleTask(t.id, e.target.checked)}
                style={{ marginTop: 1 }}
              />
              <span style={{ flex: 1, color: t.doneAt ? '#6b7280' : '#111827', opacity: t.doneAt ? 0.8 : 1 }}>
                {t.label}
              </span>
              <button
                type="button"
                onClick={() => void handleDeleteTask(t.id)}
                style={styles.removeBtn}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section style={styles.metaCard}>
        <form onSubmit={handleAddTask}>
          <label style={{ display: 'block', fontSize: 13, color: '#4b5563', marginBottom: 6, fontWeight: 600 }}>
            Add task
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Schedule social promotion"
              style={styles.input}
            />
            <button
              type="submit"
              style={styles.addBtn}
            >
              Add
            </button>
          </div>
        </form>
      </section>
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
  statPill: {
    alignSelf: 'center',
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 999,
    padding: '8px 12px',
    fontSize: 12,
    color: '#4b5563',
    fontWeight: 600,
  },
  progressCard: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: 14,
  },
  progressRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    background: '#f3f4f6',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    background: '#6d28d9',
  },
  metaCard: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: 14,
  },
  select: {
    marginLeft: 8,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    background: '#f9fafb',
    color: '#111827',
    fontSize: 13,
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
  removeBtn: {
    fontSize: 12,
    color: '#dc2626',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  },
  addBtn: {
    padding: '10px 16px',
    borderRadius: 8,
    border: 'none',
    background: '#6d28d9',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
  },
  exportBtn: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #f59e0b',
    background: 'transparent',
    color: '#b45309',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 12,
  },
};
