import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  fetchEpisode,
  fetchEpisodeCampaign,
  fetchPodsignalPreferences,
  fetchEpisodeTitleSuggestions,
  patchEpisodeCampaign,
  addCampaignTask,
  patchCampaignTask,
  deleteCampaignTask,
  createPodsignalTrackableLink,
  fetchPodsignalTrackableLinks,
  type EpisodeTitleTonePreset,
  type EpisodeTitleNichePreset,
} from '../api/client';
import type { EpisodeCampaign, CampaignStatus, LaunchPackState, TrackableLinkSummary } from '../types/podsignal';
import { useEpisodeLiveUpdates } from '../hooks/useEpisodeLiveUpdates';
import { trackOutputUsage } from '../lib/trackOutputUsage';

const STATUSES: CampaignStatus[] = ['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED'];

type ScoreBand = 'excellent' | 'strong' | 'emerging' | 'early';

function buildTitleVariants(episodeTitle: string): string[] {
  const t = episodeTitle.trim();
  if (!t) return ['Episode title', 'Episode — highlights', 'Interview episode'];
  return [t, `${t} — key takeaways`, `Interview: ${t}`];
}

function defaultGuestShare(episodeTitle: string, trackUrl?: string): string {
  const linkLine = trackUrl ? `\n\nListen: ${trackUrl}` : '\n\n(Add a trackable link from PodSignal.)';
  return `Thanks for having me on the show — here's the episode: "${episodeTitle}"${linkLine}`;
}

function defaultNewsletter(episodeTitle: string): string {
  return `This week on the show: ${episodeTitle}\n\nWe cover practical takeaways you can use this week.`;
}

function defaultSocial(episodeTitle: string): string {
  return `New episode: ${episodeTitle} — link in bio.`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function scoreBand(score: number): ScoreBand {
  if (score >= 80) return 'excellent';
  if (score >= 65) return 'strong';
  if (score >= 45) return 'emerging';
  return 'early';
}

function scoreBandLabel(band: ScoreBand): string {
  if (band === 'excellent') return 'Excellent';
  if (band === 'strong') return 'Strong';
  if (band === 'emerging') return 'Emerging';
  return 'Early';
}

function scoreBandColors(band: ScoreBand): { bg: string; border: string; text: string } {
  if (band === 'excellent') return { bg: '#ecfdf5', border: '#86efac', text: '#065f46' };
  if (band === 'strong') return { bg: '#eff6ff', border: '#93c5fd', text: '#1e3a8a' };
  if (band === 'emerging') return { bg: '#fffbeb', border: '#fcd34d', text: '#92400e' };
  return { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' };
}

function buildLaunchProofScore(input: {
  doneCount: number;
  totalTasks: number;
  approved: boolean;
  campaignStatus: CampaignStatus;
  linksCount: number;
  clicksObserved: number;
}): {
  total: number;
  execution: number;
  activation: number;
  sponsorProof: number;
  band: ScoreBand;
} {
  const taskRatio = input.totalTasks > 0 ? input.doneCount / input.totalTasks : 0;
  const execution = Math.round(
    clamp(taskRatio * 65 + (input.approved ? 25 : 0) + (input.campaignStatus !== 'DRAFT' ? 10 : 0), 0, 100),
  );
  const activation = Math.round(clamp(input.linksCount * 20 + Math.log10(1 + input.clicksObserved) * 28, 0, 100));
  const sponsorProof = Math.round(
    clamp((input.approved ? 35 : 0) + input.linksCount * 15 + Math.log10(1 + input.clicksObserved) * 35, 0, 100),
  );
  const total = Math.round(execution * 0.45 + activation * 0.25 + sponsorProof * 0.3);
  return { total, execution, activation, sponsorProof, band: scoreBand(total) };
}

export function EpisodeLaunchPage() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const [episodeTitle, setEpisodeTitle] = useState('');
  const [podcastId, setPodcastId] = useState('');
  const [campaign, setCampaign] = useState<EpisodeCampaign | null>(null);
  const [links, setLinks] = useState<TrackableLinkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [linkTarget, setLinkTarget] = useState('');
  const [linkKind, setLinkKind] = useState<'guest_share' | 'newsletter' | 'social' | 'launch' | 'other'>('guest_share');
  const [creatingLink, setCreatingLink] = useState(false);
  const [appleDesc, setAppleDesc] = useState('');
  const [spotifyDesc, setSpotifyDesc] = useState('');
  const [serverTitleSuggestions, setServerTitleSuggestions] = useState<string[]>([]);
  const [serverTitleSuggestionsUsedLlm, setServerTitleSuggestionsUsedLlm] = useState(false);
  const [titleSuggestionsLoading, setTitleSuggestionsLoading] = useState(false);
  const [titleTonePreset, setTitleTonePreset] = useState<EpisodeTitleTonePreset>('balanced');
  const [titleNichePreset, setTitleNichePreset] = useState<EpisodeTitleNichePreset>('general');

  const taskDoneLogged = useRef(new Set<string>());
  const lastTitleIdx = useRef<number | null>(null);
  const titlePrefsLoadedRef = useRef(false);
  const titlePresetHydratingRef = useRef(false);

  const fallbackTitleVariants = useMemo(() => buildTitleVariants(episodeTitle), [episodeTitle]);
  const titleVariants = serverTitleSuggestions.length > 0 ? serverTitleSuggestions : fallbackTitleVariants;

  const lp: LaunchPackState = campaign?.launchPack ?? {};

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!episodeId) return;
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const [ep, c, linkList] = await Promise.all([
        fetchEpisode(episodeId),
        fetchEpisodeCampaign(episodeId),
        fetchPodsignalTrackableLinks(episodeId).catch(() => ({ links: [] as TrackableLinkSummary[] })),
      ]);
      setEpisodeTitle(ep.title);
      setPodcastId(ep.podcastId);
      setCampaign(c);
      setLinks(linkList.links);
      const lp0 = c.launchPack ?? {};
      setAppleDesc((lp0.selectedAppleDescription as string | undefined) ?? ep.title);
      setSpotifyDesc((lp0.selectedSpotifyDescription as string | undefined) ?? ep.title);
      lastTitleIdx.current =
        typeof c.launchPack?.selectedTitleIndex === 'number' ? c.launchPack.selectedTitleIndex : 0;
    } catch (err: unknown) {
      if (!silent) {
        const er = err as { response?: { data?: { error?: string } } };
        setError(er.response?.data?.error ?? 'Failed to load launch board');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [episodeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (titlePrefsLoadedRef.current) return;
    titlePrefsLoadedRef.current = true;
    titlePresetHydratingRef.current = true;
    void fetchPodsignalPreferences()
      .then((prefs) => {
        setTitleTonePreset(prefs.titleTonePreset);
        setTitleNichePreset(prefs.titleNichePreset);
        if (episodeId) {
          void trackOutputUsage({
            eventType: 'title_preset_default_applied',
            episodeId,
            dedupeSessionKey: `title_defaults_applied:episode_launch:${episodeId}`,
            payload: {
              surface: 'episode_launch',
              tonePreset: prefs.titleTonePreset,
              nichePreset: prefs.titleNichePreset,
            },
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        titlePresetHydratingRef.current = false;
      });
  }, []);

  const handleTonePresetChange = (next: EpisodeTitleTonePreset) => {
    const prev = titleTonePreset;
    setTitleTonePreset(next);
    if (titlePresetHydratingRef.current || prev === next) return;
    void trackOutputUsage({
      eventType: 'title_preset_overridden',
      episodeId,
      payload: {
        surface: 'episode_launch',
        kind: 'tone',
        from: prev,
        to: next,
        podcastId: podcastId || null,
      },
    });
  };

  const handleNichePresetChange = (next: EpisodeTitleNichePreset) => {
    const prev = titleNichePreset;
    setTitleNichePreset(next);
    if (titlePresetHydratingRef.current || prev === next) return;
    void trackOutputUsage({
      eventType: 'title_preset_overridden',
      episodeId,
      payload: {
        surface: 'episode_launch',
        kind: 'niche',
        from: prev,
        to: next,
        podcastId: podcastId || null,
      },
    });
  };

  useEffect(() => {
    if (!episodeId || loading) return;
    void trackOutputUsage({
      eventType: 'episode_launch_page_viewed',
      episodeId,
      dedupeSessionKey: `episode_launch:${episodeId}`,
      payload: podcastId ? { podcastId } : undefined,
    });
  }, [episodeId, loading, podcastId]);

  useEpisodeLiveUpdates({
    episodeId,
    enableSse: true,
    status: undefined,
    listenForEpisodeEvents: false,
    onEpisodeEvent: () => {},
    onCampaignEvent: () => void load({ silent: true }),
  });

  const loadServerTitleSuggestions = useCallback(
    async (titleOverride?: string) => {
      if (!episodeId) return;
      const requestedTitle = (titleOverride ?? episodeTitle).trim();
      if (!requestedTitle) {
        setServerTitleSuggestions([]);
        setServerTitleSuggestionsUsedLlm(false);
        return;
      }
      setTitleSuggestionsLoading(true);
      try {
        const data = await fetchEpisodeTitleSuggestions(episodeId, 3, {
          titleOverride: requestedTitle,
          tonePreset: titleTonePreset,
          nichePreset: titleNichePreset,
        });
        setServerTitleSuggestions(data.suggestions.map((s) => s.label));
        setServerTitleSuggestionsUsedLlm(data.usedLlm);
      } catch {
        setServerTitleSuggestions([]);
        setServerTitleSuggestionsUsedLlm(false);
      } finally {
        setTitleSuggestionsLoading(false);
      }
    },
    [episodeId, episodeTitle, titleTonePreset, titleNichePreset],
  );

  useEffect(() => {
    if (!episodeId || !episodeTitle) return;
    void loadServerTitleSuggestions(episodeTitle);
  }, [episodeId, episodeTitle, titleTonePreset, titleNichePreset, loadServerTitleSuggestions]);

  const persistLaunchPack = async (patch: Record<string, unknown>) => {
    if (!episodeId || !campaign) return;
    const c = await patchEpisodeCampaign(episodeId, { launchPack: patch });
    setCampaign(c);
  };

  const onTitleVariantChange = async (idx: number) => {
    if (!episodeId || !campaign) return;
    const selected = titleVariants[idx] ?? '';
    if (lastTitleIdx.current === idx) return;
    lastTitleIdx.current = idx;
    await persistLaunchPack({
      selectedTitleIndex: idx,
      selectedTitleVariant: selected,
    });
    await trackOutputUsage({
      eventType: 'title_option_selected',
      episodeId,
      payload: { variantIndex: idx, podcastId },
    });
  };

  const approveLaunchPack = async () => {
    if (!episodeId || !campaign) return;
    await persistLaunchPack({
      status: 'approved',
      approvedAt: new Date().toISOString(),
    });
    setCampaign(await fetchEpisodeCampaign(episodeId));
    await trackOutputUsage({
      eventType: 'launch_pack_approved',
      episodeId,
      payload: { campaignId: campaign.id },
    });
  };

  const copyBlock = async (
    eventType:
      | 'guest_share_copied'
      | 'newsletter_copy_copied'
      | 'social_variant_copied'
      | 'launch_asset_copied',
    text: string,
    extraPayload?: Record<string, unknown>,
  ) => {
    if (!episodeId) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    await trackOutputUsage({
      eventType,
      episodeId,
      payload: { podcastId, ...extraPayload },
    });
  };

  const toggleTask = async (taskId: string, done: boolean) => {
    if (!episodeId) return;
    try {
      const c = await patchCampaignTask(episodeId, taskId, done);
      setCampaign(c);
      if (done && !taskDoneLogged.current.has(taskId)) {
        taskDoneLogged.current.add(taskId);
        await trackOutputUsage({
          eventType: 'campaign_checklist_task_done',
          episodeId,
          payload: { taskId, podcastId },
        });
      }
    } catch {
      /* */
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

  const primaryTrackUrl = links[0]?.publicUrl;

  const guestShareText =
    lp.guestShareText ??
    defaultGuestShare(episodeTitle, primaryTrackUrl);

  const newsletterText = lp.channelNotes?.newsletter ?? defaultNewsletter(episodeTitle);
  const socialText = lp.channelNotes?.social ?? defaultSocial(episodeTitle);

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
    await persistLaunchPack({
      status: 'exported',
      exportedAt: new Date().toISOString(),
    });
    await trackOutputUsage({
      eventType: 'launch_asset_copied',
      episodeId,
      payload: { format: 'campaign_export_json', podcastId },
    });
  };

  const createLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!episodeId || !linkTarget.trim()) return;
    setCreatingLink(true);
    try {
      await createPodsignalTrackableLink({
        episodeId,
        assetKind: linkKind,
        targetUrl: linkTarget.trim(),
      });
      setLinkTarget('');
      const list = await fetchPodsignalTrackableLinks(episodeId);
      setLinks(list.links);
    } catch {
      /* */
    } finally {
      setCreatingLink(false);
    }
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
  const clicksObserved = links.reduce((sum, link) => sum + (Number.isFinite(link.clicksObserved) ? link.clicksObserved : 0), 0);
  const proofScore = buildLaunchProofScore({
    doneCount,
    totalTasks: total,
    approved: lp.status === 'approved' || lp.status === 'exported' || lp.status === 'measured',
    campaignStatus: campaign.status,
    linksCount: links.length,
    clicksObserved,
  });
  const proofColors = scoreBandColors(proofScore.band);

  const selectedTitleIdx =
    typeof lp.selectedTitleIndex === 'number' && lp.selectedTitleIndex < titleVariants.length
      ? lp.selectedTitleIndex
      : 0;

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
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
            Launch pack status:{' '}
            <strong style={{ color: '#111827' }}>{lp.status ?? 'draft'}</strong>
            {' · '}
            Clicks on trackable links are <em>observed</em> in PodSignal — not platform listener counts.
          </p>
        </div>
        <div style={styles.statPill}>
          {doneCount}/{total} tasks completed
        </div>
      </section>

      <section
        style={{
          ...styles.metaCard,
          background: proofColors.bg,
          borderColor: proofColors.border,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, margin: 0, color: '#111827' }}>Launch Proof Score</h2>
          <span
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              border: `1px solid ${proofColors.border}`,
              color: proofColors.text,
              background: '#fff',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {proofScore.total}/100 · {scoreBandLabel(proofScore.band)}
          </span>
        </div>
        <p style={{ fontSize: 12, color: '#4b5563', margin: '8px 0 12px' }}>
          Signature scorecard for sponsor readiness: execution + audience activation + evidence strength.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          <div style={styles.scoreCell}>
            <strong style={styles.scoreValue}>{proofScore.execution}</strong>
            <span style={styles.scoreLabel}>Execution</span>
          </div>
          <div style={styles.scoreCell}>
            <strong style={styles.scoreValue}>{proofScore.activation}</strong>
            <span style={styles.scoreLabel}>Activation</span>
          </div>
          <div style={styles.scoreCell}>
            <strong style={styles.scoreValue}>{proofScore.sponsorProof}</strong>
            <span style={styles.scoreLabel}>Sponsor proof</span>
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 10, marginBottom: 0 }}>
          Benchmark: target <strong>65+</strong> before outreach; <strong>80+</strong> is sponsor-ready for most cold intros.
        </p>
      </section>

      <section style={styles.metaCard}>
        <h2 style={{ fontSize: 16, margin: '0 0 10px', color: '#111827' }}>Title options (pick one)</h2>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 10px' }}>
          {titleSuggestionsLoading
            ? 'Generating ranked options from transcript context...'
            : serverTitleSuggestions.length > 0
              ? serverTitleSuggestionsUsedLlm
                ? `AI-ranked options (${titleTonePreset} tone, ${titleNichePreset} niche).`
                : `Heuristically ranked options (${titleTonePreset} tone, ${titleNichePreset} niche).`
              : 'Using fallback title options.'}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <label style={styles.smallLabel}>
            Tone
            <select
              value={titleTonePreset}
              onChange={(e) => handleTonePresetChange(e.target.value as EpisodeTitleTonePreset)}
              style={styles.select}
            >
              <option value="balanced">Balanced</option>
              <option value="authority">Authority</option>
              <option value="curiosity">Curiosity</option>
              <option value="contrarian">Contrarian</option>
              <option value="practical">Practical</option>
            </select>
          </label>
          <label style={styles.smallLabel}>
            Niche
            <select
              value={titleNichePreset}
              onChange={(e) => handleNichePresetChange(e.target.value as EpisodeTitleNichePreset)}
              style={styles.select}
            >
              <option value="general">General</option>
              <option value="b2b">B2B</option>
              <option value="creator-economy">Creator economy</option>
              <option value="wellness">Wellness</option>
              <option value="finance">Finance</option>
              <option value="tech">Tech</option>
              <option value="media">Media</option>
            </select>
          </label>
          <button
            type="button"
            style={styles.copyBtn}
            onClick={() => void loadServerTitleSuggestions(episodeTitle)}
            disabled={titleSuggestionsLoading}
          >
            {titleSuggestionsLoading ? 'Regenerating…' : 'Regenerate titles'}
          </button>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {titleVariants.map((label, idx) => (
            <label
              key={idx}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                padding: 10,
                borderRadius: 8,
                border: selectedTitleIdx === idx ? '2px solid #6d28d9' : '1px solid #e5e7eb',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="titleVariant"
                checked={selectedTitleIdx === idx}
                onChange={() => void onTitleVariantChange(idx)}
              />
              <span style={{ fontSize: 14, color: '#111827' }}>{label}</span>
            </label>
          ))}
        </div>
      </section>

      <section style={styles.metaCard}>
        <h2 style={{ fontSize: 16, margin: '0 0 10px', color: '#111827' }}>Metadata drafts</h2>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px' }}>
          Directional copy — tune for Apple/Spotify; selecting text and copying fires usage events from copy buttons
          below.
        </p>
        <label style={styles.smallLabel}>Apple Podcasts description</label>
        <textarea
          value={appleDesc}
          onChange={(e) => setAppleDesc(e.target.value)}
          onBlur={() => void persistLaunchPack({ selectedAppleDescription: appleDesc })}
          rows={3}
          style={styles.textarea}
        />
        <label style={styles.smallLabel}>Spotify description</label>
        <textarea
          value={spotifyDesc}
          onChange={(e) => setSpotifyDesc(e.target.value)}
          onBlur={() => void persistLaunchPack({ selectedSpotifyDescription: spotifyDesc })}
          rows={3}
          style={styles.textarea}
        />
      </section>

      <section style={styles.metaCard}>
        <h2 style={{ fontSize: 16, margin: '0 0 10px', color: '#111827' }}>Guest-share kit</h2>
        <textarea value={guestShareText} readOnly rows={5} style={styles.textarea} />
        <button
          type="button"
          style={styles.copyBtn}
          onClick={() =>
            void copyBlock('guest_share_copied', guestShareText, { hasTrackableLink: !!primaryTrackUrl })
          }
        >
          Copy guest-share text
        </button>
      </section>

      <section style={styles.metaCard}>
        <h2 style={{ fontSize: 16, margin: '0 0 10px', color: '#111827' }}>Newsletter & social</h2>
        <label style={styles.smallLabel}>Newsletter blurb</label>
        <textarea value={newsletterText} readOnly rows={3} style={styles.textarea} />
        <button
          type="button"
          style={styles.copyBtn}
          onClick={() => void copyBlock('newsletter_copy_copied', newsletterText)}
        >
          Copy newsletter
        </button>
        <label style={{ ...styles.smallLabel, marginTop: 12 }}>Social post</label>
        <textarea value={socialText} readOnly rows={2} style={styles.textarea} />
        <button type="button" style={styles.copyBtn} onClick={() => void copyBlock('social_variant_copied', socialText)}>
          Copy social
        </button>
      </section>

      <section style={styles.metaCard}>
        <h2 style={{ fontSize: 16, margin: '0 0 10px', color: '#111827' }}>Trackable links</h2>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 10px' }}>
          Observed clicks when someone opens your short link — directional signal, not proof of unique listeners.
        </p>
        <form onSubmit={(e) => void createLink(e)} style={{ display: 'grid', gap: 8 }}>
          <select
            value={linkKind}
            onChange={(e) => setLinkKind(e.target.value as typeof linkKind)}
            style={styles.select}
          >
            <option value="guest_share">Guest share</option>
            <option value="newsletter">Newsletter</option>
            <option value="social">Social</option>
            <option value="launch">Launch / landing</option>
            <option value="other">Other</option>
          </select>
          <input
            value={linkTarget}
            onChange={(e) => setLinkTarget(e.target.value)}
            placeholder="https://… destination URL"
            style={styles.input}
            data-testid="pilot-trackable-target-url"
          />
          <button
            type="submit"
            disabled={creatingLink || !linkTarget.trim()}
            style={styles.addBtn}
            data-testid="pilot-create-trackable-link"
          >
            {creatingLink ? 'Creating…' : 'Create trackable link'}
          </button>
        </form>
        {links.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', fontSize: 13 }}>
            {links.map((l) => (
              <li
                key={l.id}
                style={{
                  padding: '8px 0',
                  borderBottom: '1px solid #f3f4f6',
                  display: 'grid',
                  gap: 4,
                }}
              >
                <span style={{ color: '#6b7280' }}>
                  {l.assetKind} · {l.clicksObserved} clicks (observed)
                </span>
                <code style={{ fontSize: 12, wordBreak: 'break-all' }}>{l.publicUrl}</code>
                <button
                  type="button"
                  style={styles.copyBtn}
                  onClick={() => void copyBlock('launch_asset_copied', l.publicUrl, { linkId: l.id })}
                >
                  Copy short link
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section style={styles.metaCard}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 16, margin: 0, color: '#111827' }}>Approve launch pack</h2>
          <button
            type="button"
            style={styles.approveBtn}
            onClick={() => void approveLaunchPack()}
            data-testid="pilot-approve-launch-pack"
          >
            Mark approved
          </button>
        </div>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '8px 0 0' }}>
          Saves your selected title and metadata drafts into the campaign record for reporting.
        </p>
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
        <button type="button" onClick={() => void exportJson()} style={styles.exportBtn}>
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
            <button type="submit" style={styles.addBtn}>
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
  scoreCell: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '10px 12px',
    display: 'grid',
    gap: 2,
  },
  scoreValue: {
    fontSize: 20,
    lineHeight: 1.1,
    color: '#111827',
  },
  scoreLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: 600,
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
  textarea: {
    width: '100%',
    maxWidth: 640,
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    background: '#f9fafb',
    color: '#111827',
    fontSize: 14,
    marginBottom: 8,
    boxSizing: 'border-box',
  },
  smallLabel: { display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4, fontWeight: 600 },
  copyBtn: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #c4b5fd',
    background: '#faf5ff',
    color: '#5b21b6',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 12,
  },
  approveBtn: {
    padding: '8px 14px',
    borderRadius: 8,
    border: 'none',
    background: '#059669',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 13,
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
