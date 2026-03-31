import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  fetchBillingQuotaStatus,
  fetchEpisode,
  fetchEpisodeTitleSuggestions,
  patchEpisode,
  patchEpisodeClip,
  deleteEpisode,
  processEpisode,
  uploadEpisodeAudio,
  type EpisodeConflictPayload,
} from '../api/client';
import type { EpisodeDetail } from '../types/podsignal';
import { trackOutputUsage } from '../lib/trackOutputUsage';
import { useEpisodeLiveUpdates } from '../hooks/useEpisodeLiveUpdates';
import { loadDraft, removeDraft, saveDraft } from '../lib/draftStorage';
import { getUserFacingApiError } from '../api/userFacingError';
import type { EpisodeClipRow, TranscriptSegmentRow } from '../types/podsignal';

function isRequestCanceled(err: unknown): boolean {
  const e = err as { code?: string; name?: string };
  return e.code === 'ERR_CANCELED' || e.name === 'CanceledError';
}

const TITLE_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'how', 'in', 'into', 'is', 'it',
  'of', 'on', 'or', 'that', 'the', 'their', 'this', 'to', 'we', 'what', 'when', 'where', 'with', 'you',
  'your', 'our', 'about', 'after', 'before', 'during', 'episode', 'podcast', 'interview',
]);

function normalizeTitleText(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function toTitleCase(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function trimToLength(input: string, max = 70): string {
  const s = normalizeTitleText(input);
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const noHalfWord = cut.replace(/\s+\S*$/, '').trim();
  return `${(noHalfWord || cut).trim()}…`;
}

function extractTopTerms(text: string, limit: number): string[] {
  const counts = new Map<string, number>();
  const words = text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  for (const w of words) {
    const cleaned = w.replace(/^'+|'+$/g, '');
    if (cleaned.length < 4) continue;
    if (TITLE_STOP_WORDS.has(cleaned)) continue;
    counts.set(cleaned, (counts.get(cleaned) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => (b[1] === a[1] ? a[0].localeCompare(b[0]) : b[1] - a[1]))
    .slice(0, limit)
    .map(([term]) => term);
}

function chooseTopicPhrase(terms: string[]): string | null {
  if (!terms.length) return null;
  if (terms.length === 1) return toTitleCase(terms[0]);
  return toTitleCase(`${terms[0]} ${terms[1]}`);
}

function buildTitleVariants(input: {
  title: string;
  summary: string | null;
  transcript: string | null;
  clips: EpisodeClipRow[];
  transcriptSegments: TranscriptSegmentRow[];
}): string[] {
  const baseTitle = normalizeTitleText(input.title);
  if (!baseTitle) return ['Episode title', 'Episode highlights', 'Best moments from this episode'];

  const clipTitles = input.clips.slice(0, 4).map((c) => c.title).join(' ');
  const segmentText = input.transcriptSegments
    .slice(0, 12)
    .map((s) => s.text)
    .join(' ');
  const context = [input.summary ?? '', clipTitles, segmentText, input.transcript?.slice(0, 900) ?? '']
    .join(' ')
    .trim();
  const topTerms = extractTopTerms(context, 6);
  const topicPhrase = chooseTopicPhrase(topTerms);
  const firstClip = normalizeTitleText(input.clips[0]?.title ?? '');

  const rawCandidates = [
    baseTitle,
    topicPhrase ? `${baseTitle} | ${topicPhrase}` : `${baseTitle} | Key moments`,
    topicPhrase ? `How ${topicPhrase} actually works (${baseTitle})` : `What this episode gets right: ${baseTitle}`,
    firstClip ? `${firstClip} — from ${baseTitle}` : `${baseTitle} — Highlights and takeaways`,
    topicPhrase ? `${topicPhrase}: ${baseTitle}` : `${baseTitle} — Deep dive`,
    topTerms[2] ? `${toTitleCase(topTerms[2])} insights from ${baseTitle}` : `${baseTitle} — Practical insights`,
  ]
    .map((s) => trimToLength(s))
    .filter(Boolean);

  const seen = new Set<string>();
  const uniqueCandidates = rawCandidates.filter((c) => {
    const key = c.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const scored = uniqueCandidates
    .map((candidate) => {
      const normalized = candidate.toLowerCase();
      const lenDelta = Math.abs(candidate.length - 58);
      const lenScore = Math.max(0, 1 - lenDelta / 58);
      const keywordHits = topTerms.reduce((acc, term) => (normalized.includes(term) ? acc + 1 : acc), 0);
      const keywordScore = Math.min(0.45, keywordHits * 0.15);
      const structureBonus = /[:|?]/.test(candidate) ? 0.08 : 0;
      return { candidate, score: lenScore + keywordScore + structureBonus };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.candidate);

  if (scored.length >= 3) return scored;
  const fallback = [`${baseTitle} — Highlights`, `${baseTitle} — Deep dive`];
  return [...scored, ...fallback].slice(0, 3);
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}:${rs.toString().padStart(2, '0')}`;
}

function mergeSilentEpisode(prev: EpisodeDetail | null, next: EpisodeDetail, dirty: { title: boolean; audioUrl: boolean }): EpisodeDetail {
  const base: EpisodeDetail = {
    ...next,
    transcriptSegments: next.transcriptSegments ?? [],
    signals: next.signals,
    clips: next.clips,
  };
  if (!prev) return base;
  return {
    ...base,
    title: dirty.title ? prev.title : next.title,
    audioUrl: dirty.audioUrl ? prev.audioUrl : next.audioUrl,
  };
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
  const [conflict, setConflict] = useState<EpisodeConflictPayload['episode'] | null>(null);
  const [draftPrompt, setDraftPrompt] = useState<{ title: string; audioUrl: string } | null>(null);
  const [draftRestoredBanner, setDraftRestoredBanner] = useState(false);
  const [titleVariantIdx, setTitleVariantIdx] = useState(0);
  const [billingQuota, setBillingQuota] = useState<{ reviewsUsed: number; reviewLimit: number } | null>(null);
  const [serverTitleSuggestions, setServerTitleSuggestions] = useState<string[]>([]);
  const [serverTitleSuggestionsUsedLlm, setServerTitleSuggestionsUsedLlm] = useState(false);
  const [titleSuggestionsLoading, setTitleSuggestionsLoading] = useState(false);
  const [serverTitleSuggestionsForTitle, setServerTitleSuggestionsForTitle] = useState('');

  const userEditedRef = useRef({ title: false, audioUrl: false });
  const baselineUpdatedAtRef = useRef<string | null>(null);
  const saveLockRef = useRef(false);
  const processLockRef = useRef(false);
  const deleteLockRef = useRef(false);

  const load = useCallback(
    async (opts?: { silent?: boolean; signal?: AbortSignal }) => {
      if (!episodeId) return;
      if (!opts?.silent) setLoading(true);
      setError('');
      try {
        const e = await fetchEpisode(episodeId, { signal: opts?.signal });
        const normalized: EpisodeDetail = {
          ...e,
          transcriptSegments: e.transcriptSegments ?? [],
        };
        if (!opts?.silent) {
          setEpisode(normalized);
          setTitle(e.title);
          setAudioUrl(e.audioUrl ?? '');
          userEditedRef.current = { title: false, audioUrl: false };
          baselineUpdatedAtRef.current = normalized.updatedAt;
          setTitleVariantIdx(0);
          const d = loadDraft<{ title: string; audioUrl: string }>(`episode_${episodeId}`);
          if (
            d &&
            (d.value.title !== e.title || (d.value.audioUrl || '') !== (e.audioUrl ?? ''))
          ) {
            setDraftPrompt({ title: d.value.title, audioUrl: d.value.audioUrl });
          } else {
            setDraftPrompt(null);
          }
        } else {
          const dirty = userEditedRef.current;
          setEpisode((prev) => mergeSilentEpisode(prev, normalized, dirty));
          if (!dirty.title) setTitle(normalized.title);
          if (!dirty.audioUrl) setAudioUrl(normalized.audioUrl ?? '');
          if (!dirty.title && !dirty.audioUrl) {
            baselineUpdatedAtRef.current = normalized.updatedAt;
          }
        }
      } catch (err: unknown) {
        if (isRequestCanceled(err)) return;
        setError(getUserFacingApiError(err, 'Failed to load episode'));
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [episodeId],
  );

  useEffect(() => {
    const ac = new AbortController();
    void load({ signal: ac.signal });
    return () => ac.abort();
  }, [load]);

  useEffect(() => {
    void fetchBillingQuotaStatus().then((q) => {
      if (q) setBillingQuota({ reviewsUsed: q.reviewsUsed, reviewLimit: q.reviewLimit });
      else setBillingQuota(null);
    });
  }, [episodeId]);

  useEffect(() => {
    if (!episodeId || !episode) return;
    void trackOutputUsage({
      eventType: 'episode_detail_page_viewed',
      episodeId,
      dedupeSessionKey: `episode_detail:${episodeId}`,
      payload: { podcastId: episode.podcastId },
    });
  }, [episodeId, episode]);

  const loadServerTitleSuggestions = useCallback(
    async (titleOverride?: string) => {
      if (!episodeId) return;
      const requestedTitle = (titleOverride ?? title).trim();
      setTitleSuggestionsLoading(true);
      try {
        const data = await fetchEpisodeTitleSuggestions(episodeId, 3, {
          titleOverride: requestedTitle || undefined,
        });
        setServerTitleSuggestions(data.suggestions.map((s) => s.label));
        setServerTitleSuggestionsUsedLlm(data.usedLlm);
        setServerTitleSuggestionsForTitle(requestedTitle);
      } catch {
        setServerTitleSuggestions([]);
        setServerTitleSuggestionsUsedLlm(false);
        setServerTitleSuggestionsForTitle('');
      } finally {
        setTitleSuggestionsLoading(false);
      }
    },
    [episodeId, title],
  );

  useEffect(() => {
    if (!episodeId || !episode) return;
    void loadServerTitleSuggestions(episode.title);
  }, [episodeId, episode?.updatedAt, loadServerTitleSuggestions]);

  useEffect(() => {
    if (!episodeId || !episode) return;
    const t = window.setTimeout(() => {
      saveDraft(`episode_${episodeId}`, { title, audioUrl });
    }, 500);
    return () => window.clearTimeout(t);
  }, [episodeId, episode, title, audioUrl]);

  const onLiveRefresh = useCallback(() => {
    void load({ silent: true });
  }, [load]);

  const { liveStatus } = useEpisodeLiveUpdates({
    episodeId,
    enableSse: true,
    status: episode?.status,
    onEpisodeEvent: onLiveRefresh,
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!episodeId || !title.trim() || saveLockRef.current) return;
    saveLockRef.current = true;
    setSaving(true);
    setError('');
    setConflict(null);
    try {
      const updated = await patchEpisode(episodeId, {
        title: title.trim(),
        audioUrl: audioUrl.trim() || undefined,
        ifUnmodifiedSince: baselineUpdatedAtRef.current ?? undefined,
      });
      userEditedRef.current = { title: false, audioUrl: false };
      baselineUpdatedAtRef.current = updated.updatedAt;
      removeDraft(`episode_${episodeId}`);
      setDraftPrompt(null);
      setDraftRestoredBanner(false);
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
      setTitle(updated.title);
      setAudioUrl(updated.audioUrl ?? '');
    } catch (err: unknown) {
      const ax = err as {
        response?: { status?: number; data?: EpisodeConflictPayload | { error?: string } };
      };
      if (ax.response?.status === 409) {
        const data = ax.response.data as EpisodeConflictPayload | undefined;
        if (data?.code === 'CONFLICT' && data.episode) {
          setConflict(data.episode);
          setError(data.error);
        } else {
          setError('This episode changed on the server. Reload or choose which version to keep.');
        }
      } else {
        setError(getUserFacingApiError(err, 'Save failed'));
      }
    } finally {
      setSaving(false);
      saveLockRef.current = false;
    }
  };

  const applyServerVersionFromConflict = () => {
    if (!conflict) return;
    setTitle(conflict.title);
    setAudioUrl(conflict.audioUrl ?? '');
    userEditedRef.current = { title: false, audioUrl: false };
    baselineUpdatedAtRef.current = conflict.updatedAt;
    setEpisode((prev) =>
      prev
        ? {
            ...prev,
            title: conflict.title,
            audioUrl: conflict.audioUrl ?? null,
            updatedAt: conflict.updatedAt,
          }
        : prev,
    );
    setConflict(null);
    setError('');
    if (episodeId) removeDraft(`episode_${episodeId}`);
  };

  const keepMyEditsWithNewBaseline = () => {
    if (!conflict) return;
    baselineUpdatedAtRef.current = conflict.updatedAt;
    setConflict(null);
    setError('');
  };

  const restoreDraftFromPrompt = () => {
    if (!draftPrompt) return;
    setTitle(draftPrompt.title);
    setAudioUrl(draftPrompt.audioUrl);
    userEditedRef.current = { title: true, audioUrl: true };
    setDraftPrompt(null);
    setDraftRestoredBanner(true);
  };

  const discardDraftPrompt = () => {
    if (episodeId) removeDraft(`episode_${episodeId}`);
    setDraftPrompt(null);
  };

  const handleProcess = async () => {
    if (!episodeId || processLockRef.current) return;
    processLockRef.current = true;
    setProcessing(true);
    setError('');
    try {
      await processEpisode(episodeId);
      await load({ silent: true });
      const q = await fetchBillingQuotaStatus();
      if (q) setBillingQuota({ reviewsUsed: q.reviewsUsed, reviewLimit: q.reviewLimit });
    } catch (err: unknown) {
      const ax = err as { response?: { status?: number; data?: { error?: string } } };
      if (ax.response?.status === 409) {
        await load({ silent: true });
      } else {
        setError(getUserFacingApiError(err, 'Could not start processing'));
      }
      void fetchBillingQuotaStatus().then((q) => {
        if (q) setBillingQuota({ reviewsUsed: q.reviewsUsed, reviewLimit: q.reviewLimit });
      });
    } finally {
      setProcessing(false);
      processLockRef.current = false;
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !episodeId) return;
    setUploading(true);
    setError('');
    try {
      const res = await uploadEpisodeAudio(episodeId, file);
      userEditedRef.current.audioUrl = false;
      baselineUpdatedAtRef.current = res.episode.updatedAt;
      setEpisode((prev) =>
        prev ? { ...prev, ...res.episode, transcriptSegments: prev.transcriptSegments } : prev,
      );
      setAudioUrl(res.episode.audioUrl ?? '');
    } catch (err: unknown) {
      setError(getUserFacingApiError(err, 'Upload failed'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async () => {
    if (!episodeId || !episode || deleteLockRef.current) return;
    if (!window.confirm('Delete this episode? This cannot be undone.')) return;
    deleteLockRef.current = true;
    setDeleting(true);
    setError('');
    try {
      await deleteEpisode(episodeId);
      navigate(`/shows/${episode.podcastId}`);
    } catch (err: unknown) {
      setError(getUserFacingApiError(err, 'Delete failed'));
    } finally {
      setDeleting(false);
      deleteLockRef.current = false;
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

  const processingQuotaExceeded =
    billingQuota !== null && billingQuota.reviewsUsed >= billingQuota.reviewLimit;

  const canProcess =
    hasAudio &&
    episode.status !== 'PROCESSING' &&
    episode.status !== 'ARCHIVED' &&
    episode.status !== 'PUBLISHED' &&
    !processingQuotaExceeded;

  const fallbackTitleVariants = buildTitleVariants({
    title,
    summary: episode.summary,
    transcript: episode.transcript,
    clips: episode.clips,
    transcriptSegments: episode.transcriptSegments,
  });

  const youtubeTitleVariants =
    title.trim() === serverTitleSuggestionsForTitle && serverTitleSuggestions.length > 0
      ? serverTitleSuggestions
      : fallbackTitleVariants;
  const effectiveTitleVariantIdx =
    titleVariantIdx >= 0 && titleVariantIdx < youtubeTitleVariants.length ? titleVariantIdx : 0;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {draftRestoredBanner ? (
        <div
          style={{
            background: '#ecfdf5',
            border: '1px solid #6ee7b7',
            color: '#065f46',
            padding: '10px 12px',
            borderRadius: 8,
            fontSize: 13,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>Draft from this browser session was applied to the form.</span>
          <button
            type="button"
            onClick={() => setDraftRestoredBanner(false)}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid #059669',
              background: '#fff',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {processingQuotaExceeded ? (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fcd34d',
            color: '#78350f',
            padding: '12px 14px',
            borderRadius: 8,
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          <strong>Processing credits used up.</strong> You have reached {billingQuota!.reviewLimit} episode processing runs
          for this billing period ({billingQuota!.reviewsUsed}/{billingQuota!.reviewLimit}).{' '}
          <Link to="/billing" style={{ color: '#b45309', fontWeight: 700 }}>
            Open Billing
          </Link>{' '}
          to upgrade or review your plan.
        </div>
      ) : null}

      {billingQuota && !processingQuotaExceeded && canProcess ? (
        <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
          Processing credits: {billingQuota.reviewsUsed} / {billingQuota.reviewLimit} used this period (each transcription
          run counts once). Free plans reset monthly in UTC; paid plans follow your Stripe billing period.
        </p>
      ) : null}

      {draftPrompt ? (
        <div
          style={{
            background: '#eff6ff',
            border: '1px solid #93c5fd',
            color: '#1e3a8a',
            padding: '12px 14px',
            borderRadius: 8,
            fontSize: 14,
          }}
        >
          <strong>Unsaved draft found.</strong> Your browser has different title or audio URL than the
          server copy.
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            <button type="button" onClick={() => restoreDraftFromPrompt()} style={styles.draftBtnPrimary}>
              Restore draft
            </button>
            <button type="button" onClick={() => discardDraftPrompt()} style={styles.draftBtnGhost}>
              Use server version
            </button>
          </div>
        </div>
      ) : null}

      {conflict ? (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fcd34d',
            color: '#78350f',
            padding: '12px 14px',
            borderRadius: 8,
            fontSize: 14,
          }}
        >
          <strong>Someone else saved changes</strong> (or another tab updated this episode).
          <div style={{ marginTop: 8, fontSize: 13 }}>
            <div>
              <span style={{ color: '#92400e' }}>Server title:</span> {conflict.title}
            </div>
            <div>
              <span style={{ color: '#92400e' }}>Server audio URL:</span>{' '}
              {conflict.audioUrl || '—'}
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              onClick={() => {
                setConflict(null);
                void load();
              }}
              style={styles.draftBtnPrimary}
            >
              Reload latest
            </button>
            <button type="button" onClick={() => applyServerVersionFromConflict()} style={styles.draftBtnGhost}>
              Use server version
            </button>
            <button
              type="button"
              onClick={() => keepMyEditsWithNewBaseline()}
              style={styles.draftBtnGhost}
            >
              Keep my edits &amp; retry save
            </button>
          </div>
        </div>
      ) : null}

      {liveStatus === 'degraded' && episode.status === 'PROCESSING' ? (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#92400e',
            padding: '10px 12px',
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          Live connection unavailable — status still updates every few seconds. If this stays on
          &quot;Processing&quot; too long, refresh the page.
        </div>
      ) : null}

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
          <h1 style={styles.title}>{title}</h1>
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
            onChange={(e) => {
              userEditedRef.current.title = true;
              setTitle(e.target.value);
            }}
            style={styles.input}
          />

          <label style={styles.label}>Audio URL (HTTPS)</label>
          <input
            value={audioUrl}
            onChange={(e) => {
              userEditedRef.current.audioUrl = true;
              setAudioUrl(e.target.value);
            }}
            placeholder="https://example.com/episode.mp3"
            style={styles.input}
          />

          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12, textAlign: 'left' }}>
            Or upload a file (mp3, wav, m4a, webm, ogg, mp4):
          </p>
          <label style={styles.uploadBtn}>
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
            <button type="submit" disabled={saving} style={styles.primaryBtn}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => void handleProcess()}
              disabled={processing || !canProcess}
              title={
                processingQuotaExceeded
                  ? 'Processing quota reached — open Billing to upgrade'
                  : !hasAudio
                    ? 'Add audio URL or upload a file first'
                    : undefined
              }
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

      {episode.clips && episode.clips.length > 0 && (
        <section style={styles.card}>
          <h3 style={{ fontSize: 16, color: '#111827', marginBottom: 8 }}>Clip candidates</h3>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
            Approve clips you want in the launch pack. This records an observed approval in PodSignal (not platform
            performance).
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
            {episode.clips.map((c) => (
              <li
                key={c.id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  padding: 12,
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div style={{ fontWeight: 600, color: '#111827' }}>{c.title}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  {formatMs(c.startSec * 1000)} – {formatMs(c.endSec * 1000)}
                </div>
                {c.transcriptSnippet ? (
                  <p style={{ fontSize: 13, color: '#374151', margin: 0 }}>{c.transcriptSnippet}</p>
                ) : null}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    disabled={c.isPublished}
                    onClick={() => {
                      if (!episodeId) return;
                      void (async () => {
                        try {
                          await patchEpisodeClip(episodeId, c.id, { isPublished: true });
                          await trackOutputUsage({
                            eventType: 'clip_candidate_approved',
                            episodeId,
                            payload: { clipId: c.id, podcastId: episode.podcastId },
                          });
                          await load({ silent: true });
                        } catch {
                          /* */
                        }
                      })();
                    }}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: c.isPublished ? '#d1d5db' : '#059669',
                      color: '#fff',
                      fontWeight: 600,
                      cursor: c.isPublished ? 'not-allowed' : 'pointer',
                      fontSize: 13,
                    }}
                  >
                    {c.isPublished ? 'Approved' : 'Approve for launch'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section style={styles.card}>
        <h3 style={{ fontSize: 16, color: '#111827', marginBottom: 8 }}>YouTube title options</h3>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
          Pick a primary title variant for packaging (observed selection in PodSignal).
        </p>
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: -4, marginBottom: 10 }}>
          {titleSuggestionsLoading
            ? 'Generating ranked options from transcript context...'
            : serverTitleSuggestions.length > 0 && title.trim() === serverTitleSuggestionsForTitle
              ? serverTitleSuggestionsUsedLlm
                ? 'AI-ranked from transcript, clips, and summary.'
                : 'Heuristically ranked from transcript, clips, and summary.'
              : 'Using local fallback options. Click regenerate to rank current title context.'}
        </p>
        <div style={{ marginBottom: 10 }}>
          <button
            type="button"
            onClick={() => void loadServerTitleSuggestions(title)}
            disabled={titleSuggestionsLoading}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #d1d5db',
              background: '#fff',
              color: '#374151',
              fontSize: 12,
              fontWeight: 600,
              cursor: titleSuggestionsLoading ? 'wait' : 'pointer',
            }}
          >
            {titleSuggestionsLoading ? 'Regenerating...' : 'Regenerate titles'}
          </button>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {youtubeTitleVariants.map((label, idx) => (
            <label
              key={idx}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                padding: 10,
                borderRadius: 8,
                border: effectiveTitleVariantIdx === idx ? '2px solid #6366f1' : '1px solid #e5e7eb',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="ytTitle"
                checked={effectiveTitleVariantIdx === idx}
                onChange={() => {
                  if (effectiveTitleVariantIdx === idx) return;
                  setTitleVariantIdx(idx);
                  void trackOutputUsage({
                    eventType: 'title_option_selected',
                    episodeId,
                    payload: { variantIndex: idx, surface: 'episode_detail', podcastId: episode.podcastId },
                  });
                }}
              />
              <span style={{ fontSize: 14, color: '#111827' }}>{label}</span>
            </label>
          ))}
        </div>
      </section>

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

      {import.meta.env.DEV ? (
        <section style={styles.card}>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0, textAlign: 'left' }}>
            Dev: set <code>TRANSCRIPTION_PROVIDER=assemblyai</code> and <code>ASSEMBLYAI_API_KEY</code> on the server for
            real ASR; <code>stub</code> returns placeholder text.
          </p>
        </section>
      ) : null}

      {hasAudio &&
      episode.status !== 'PROCESSING' &&
      !episode.transcript &&
      (!episode.transcriptSegments || episode.transcriptSegments.length === 0) ? (
        <section style={styles.card}>
          <p style={{ fontSize: 14, color: '#4b5563', margin: 0 }}>
            No transcript yet. Click <strong>Run transcription</strong> above — results appear here when processing
            finishes.
          </p>
        </section>
      ) : null}

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
  navLink: { color: '#4f46e5', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
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
    background: '#6366f1',
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
  draftBtnPrimary: {
    padding: '8px 14px',
    borderRadius: 8,
    border: 'none',
    background: '#6366f1',
    color: '#fff',
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
  },
  draftBtnGhost: {
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid #d97706',
    background: '#fff',
    color: '#92400e',
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
  },
};
