import axios from 'axios';
import { navigateToLoginAfterUnauthorized } from '../auth/authNavigation';
import { applyHttpPolicy } from './httpPolicy';
import type { ConsoleInvestigationResponse } from '../types/investigation';
import type { OnboardingState, DashboardStats, PaginatedInvestigations } from '../types/auth';
import type {
  Podcast,
  Episode,
  EpisodeDetail,
  PaginatedEpisodes,
  EpisodeCampaign,
  CampaignStatus,
  EpisodeClipRow,
  TrackableLinkSummary,
} from '../types/podsignal';

export const api = axios.create({
  baseURL: '/',
  withCredentials: true,
});

// SPA navigation on 401 — preserves return path via authNavigation (see AuthNavigationRegistrar)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = String(err.config?.url ?? '');
    if (
      err.response?.status === 401 &&
      !url.includes('/api/auth/me') &&
      !url.includes('/api/auth/login') &&
      !url.includes('/api/auth/signup') &&
      !url.includes('/api/auth/forgot-password') &&
      !url.includes('/api/auth/reset-password')
    ) {
      navigateToLoginAfterUnauthorized();
    }
    return Promise.reject(err);
  },
);

// GET retry + timeout defaults (registered after 401 so retries run before auth redirect on error chain)
applyHttpPolicy(api);

// ── App mode (public) ───────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  /** True when Postgres, Redis, and PodSignal pilot schema are all OK */
  ready?: boolean;
  db: string;
  redis: string;
  uptime: number;
  legacyReviewGuard?: boolean;
  /** Present when DB is connected — migration 0013 pilot schema check */
  podsignalPilotSchema?: {
    ok: boolean;
    missing?: string[];
    migrationHint?: string;
  };
}

export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>('/health');
  return data;
}

export interface PodsignalSummary {
  shows: number;
  episodes: number;
  episodesByStatus: Record<string, number>;
  activeCampaigns: number;
  launchTasksDone: number;
  launchTasksTotal: number;
}

export async function fetchPodsignalSummary(): Promise<PodsignalSummary> {
  const { data } = await api.get<PodsignalSummary>('/api/analytics/podsignal-summary');
  return data;
}

/** Single round-trip for episode dropdowns (replaces per-podcast episode fetches). */
export async function fetchEpisodeOptionsForForms(limit = 300): Promise<{ id: string; label: string }[]> {
  const { data } = await api.get<{ options: { id: string; label: string }[] }>(
    '/api/analytics/episode-options',
    { params: { limit } },
  );
  return data.options;
}

/** Mirrors GET /api/billing/status — used for episode processing quota UI. */
export interface BillingQuotaPublic {
  plan: string;
  status: string;
  reviewLimit: number;
  reviewsUsed: number;
  currentPeriodEnd: string | null;
  stripeConfigured: boolean;
}

export async function fetchBillingQuotaStatus(): Promise<BillingQuotaPublic | null> {
  try {
    const { data } = await api.get<BillingQuotaPublic>('/api/billing/status');
    return data;
  } catch {
    return null;
  }
}

export const HOST_METRIC_KEYS = [
  'spotify_streams_7d',
  'apple_plays_7d',
  'youtube_views_7d',
  'rss_downloads_7d',
  'newsletter_opens',
  'other',
] as const;

export type HostMetricKey = (typeof HOST_METRIC_KEYS)[number];

export interface HostMetricSnapshotRow {
  id: string;
  metricKey: string;
  customLabel: string | null;
  value: number;
  sourceNote: string;
  episodeId: string | null;
  episodeTitle: string | null;
  createdAt: string;
  evidence: 'self_reported';
}

export async function fetchHostMetricSnapshots(limit = 50): Promise<{ snapshots: HostMetricSnapshotRow[] }> {
  const { data } = await api.get<{ snapshots: HostMetricSnapshotRow[] }>('/api/analytics/host-snapshots', {
    params: { limit },
  });
  return data;
}

export async function createHostMetricSnapshot(body: {
  metricKey: HostMetricKey;
  customLabel?: string | null;
  value: number;
  sourceNote?: string | null;
  episodeId?: string | null;
}): Promise<void> {
  await api.post('/api/analytics/host-snapshots', body);
}

export async function deleteHostMetricSnapshot(id: string): Promise<void> {
  await api.delete(`/api/analytics/host-snapshots/${id}`);
}

// ── PodSignal — podcasts & episodes ─────────────────────────────────────────

export async function fetchPodcasts(): Promise<{ podcasts: Podcast[] }> {
  const { data } = await api.get<{ podcasts: Podcast[] }>('/api/podcasts');
  return data;
}

export async function createPodcast(body: {
  title: string;
  description?: string;
  artworkUrl?: string;
  rssFeedUrl?: string;
}): Promise<Podcast> {
  const { data } = await api.post<Podcast>('/api/podcasts', body);
  return data;
}

export async function fetchPodcast(id: string): Promise<Podcast> {
  const { data } = await api.get<Podcast>(`/api/podcasts/${id}`);
  return data;
}

export async function fetchEpisodes(params: {
  podcastId: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedEpisodes> {
  const { data } = await api.get<PaginatedEpisodes>('/api/episodes', { params });
  return data;
}

/** All episodes across the user's podcasts — single request (replaces N+1 fan-out). */
export async function fetchWorkspaceEpisodes(params?: {
  limit?: number;
  offset?: number;
}): Promise<{
  episodes: (Episode & { podcastTitle: string })[];
  total: number;
  limit: number;
  offset: number;
}> {
  const { data } = await api.get('/api/episodes/workspace', { params });
  return data;
}

export async function createEpisode(body: {
  podcastId: string;
  title: string;
  description?: string;
  audioUrl?: string;
  episodeNumber?: number;
  seasonNumber?: number;
}): Promise<Episode> {
  const { data } = await api.post<Episode>('/api/episodes', body);
  return data;
}

export async function fetchEpisode(
  id: string,
  opts?: { signal?: AbortSignal },
): Promise<EpisodeDetail> {
  const { data } = await api.get<EpisodeDetail>(`/api/episodes/${id}`, {
    signal: opts?.signal,
  });
  return data;
}

/** Server response body when PATCH fails with 409 concurrent edit. */
export interface EpisodeConflictPayload {
  error: string;
  code: 'CONFLICT';
  episode: {
    id: string;
    title: string;
    audioUrl: string | null;
    updatedAt: string;
  };
}

export async function patchEpisode(
  id: string,
  body: Partial<{
    title: string;
    description: string;
    audioUrl: string;
    status: string;
    transcript: string;
    summary: string;
    ifUnmodifiedSince: string;
  }>,
): Promise<Episode> {
  const { data } = await api.patch<Episode>(`/api/episodes/${id}`, body);
  return data;
}

export async function deleteEpisode(id: string): Promise<void> {
  await api.delete(`/api/episodes/${id}`);
}

export async function fetchEpisodeCampaign(episodeId: string): Promise<EpisodeCampaign> {
  const { data } = await api.get<EpisodeCampaign>(`/api/episodes/${episodeId}/campaign`);
  return data;
}

export async function patchEpisodeCampaign(
  episodeId: string,
  body: Partial<{
    status: CampaignStatus;
    utmCampaign: string | null;
    startedAt: string | null;
    completedAt: string | null;
    launchPack: Record<string, unknown>;
  }>,
): Promise<EpisodeCampaign> {
  const { data } = await api.patch<EpisodeCampaign>(`/api/episodes/${episodeId}/campaign`, body);
  return data;
}

export async function patchEpisodeClip(
  episodeId: string,
  clipId: string,
  body: { isPublished?: boolean },
): Promise<{ clip: EpisodeClipRow }> {
  const { data } = await api.patch<{ clip: EpisodeClipRow }>(
    `/api/episodes/${episodeId}/clips/${clipId}`,
    body,
  );
  return data;
}

export async function addCampaignTask(
  episodeId: string,
  body: { label: string; taskType?: string; sortOrder?: number },
): Promise<EpisodeCampaign> {
  const { data } = await api.post<EpisodeCampaign>(`/api/episodes/${episodeId}/campaign/tasks`, body);
  return data;
}

export async function patchCampaignTask(
  episodeId: string,
  taskId: string,
  done: boolean,
): Promise<EpisodeCampaign> {
  const { data } = await api.patch<EpisodeCampaign>(
    `/api/episodes/${episodeId}/campaign/tasks/${taskId}`,
    { done },
  );
  return data;
}

export async function deleteCampaignTask(episodeId: string, taskId: string): Promise<EpisodeCampaign> {
  const { data } = await api.delete<EpisodeCampaign>(
    `/api/episodes/${episodeId}/campaign/tasks/${taskId}`,
  );
  return data;
}

export async function processEpisode(id: string): Promise<{
  status: string;
  episodeId: string;
  message: string;
}> {
  const { data } = await api.post(`/api/episodes/${id}/process`);
  return data;
}

export async function uploadEpisodeAudio(
  episodeId: string,
  file: File,
): Promise<{
  audioLocalRelPath: string;
  audioMimeType: string;
  bytes: number;
  episode: Episode;
}> {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await api.post(`/api/episodes/${episodeId}/audio`, fd);
  return data;
}

// ── Investigation (existing) ──────────────────────────────────────────────────

export async function fetchInvestigation(
  investigationId: string,
): Promise<ConsoleInvestigationResponse> {
  const { data } = await api.get<ConsoleInvestigationResponse>(
    `/api/console/investigations/${investigationId}`,
  );
  return data;
}

export async function confirmInvestigation(
  investigationId: string,
  merchantUserId: string,
  acknowledgedSections: number[],
): Promise<{ status: string; human_reviewed_at: string; pdf_poll_url: string }> {
  const { data } = await api.post(
    `/api/console/investigations/${investigationId}/confirm`,
    { merchantUserId, acknowledgedSections },
  );
  return data;
}

export async function pollPdfStatus(
  investigationId: string,
): Promise<{ status: 'pending' | 'ready'; downloadUrl?: string }> {
  const { data } = await api.get(
    `/api/console/investigations/${investigationId}/pdf-status`,
  );
  return data;
}

// ── Onboarding ────────────────────────────────────────────────────────────────

export async function fetchOnboardingState(): Promise<OnboardingState> {
  const { data } = await api.get<OnboardingState>('/api/onboarding/state');
  return data;
}

export async function updateOnboardingBusiness(businessName: string) {
  const { data } = await api.put('/api/onboarding/step/business', { businessName });
  return data;
}

export async function updateOnboardingPos(
  posProvider: string,
  posApiKey: string,
  cloverMerchantId?: string,
) {
  const { data } = await api.put('/api/onboarding/step/pos', {
    posProvider,
    posApiKey,
    cloverMerchantId,
  });
  return data;
}

export async function updateOnboardingGoogle(googlePlaceId: string) {
  const { data } = await api.put('/api/onboarding/step/google', { googlePlaceId });
  return data;
}

export async function finalizeOnboarding(): Promise<{
  merchantId: string;
  webhookSecret: string;
  webhookUrl: string;
}> {
  const { data } = await api.post('/api/onboarding/finalize');
  return data;
}

export async function finalizePodsignalOnboarding(body: {
  workspaceName: string;
}): Promise<{ merchantId: string }> {
  const { data } = await api.post<{ merchantId: string }>(
    '/api/onboarding/finalize-podsignal',
    body,
  );
  return data;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const { data } = await api.get<DashboardStats>('/api/dashboard/stats');
  return data;
}

export async function fetchDashboardInvestigations(params: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedInvestigations> {
  const { data } = await api.get<PaginatedInvestigations>('/api/dashboard/investigations', {
    params,
  });
  return data;
}

// ── Settings ─────────────────────────────────────────────────────────────────

export interface PosStatus {
  posProvider: string;
  isActive: boolean;
  lastSyncAt: string | null;
  hasApiKey: boolean;
  cloverMerchantId: string | null;
}

export interface WebhookConfig {
  webhookUrl: string;
  webhookSecret: string;
  googlePlaceId: string;
}

export interface NotificationPreferences {
  emailConfigured: boolean;
  preferences: {
    onNewReview: boolean;
    onScoringComplete: boolean;
    onPdfReady: boolean;
    onPosSync: boolean;
    dailyDigest: boolean;
  };
}

export interface AccountInfo {
  email: string;
  fullName: string;
  role: string;
  createdAt: string;
}

export async function fetchPosStatus(): Promise<PosStatus> {
  const { data } = await api.get<PosStatus>('/api/settings/pos');
  return data;
}

export async function triggerPosSync(): Promise<{ status: string }> {
  const { data } = await api.post('/api/settings/pos/sync');
  return data;
}

export async function fetchPosOAuthUrl(provider?: string): Promise<{ oauthUrl: string }> {
  const { data } = await api.get('/api/settings/pos/oauth-url', {
    params: provider ? { provider } : undefined,
  });
  return data;
}

export async function fetchWebhookConfig(): Promise<WebhookConfig> {
  const { data } = await api.get<WebhookConfig>('/api/settings/webhook');
  return data;
}

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  const { data } = await api.get<NotificationPreferences>('/api/settings/notifications');
  return data;
}

export async function fetchAccountInfo(): Promise<AccountInfo> {
  const { data } = await api.get<AccountInfo>('/api/settings/account');
  return data;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }> {
  const { data } = await api.put('/api/settings/account/password', { currentPassword, newPassword });
  return data;
}

export async function updateNotificationPreferences(prefs: Partial<NotificationPreferences['preferences']>): Promise<{ ok: boolean; preferences: NotificationPreferences['preferences'] }> {
  const { data } = await api.put('/api/settings/notifications', prefs);
  return data;
}

export interface TeamMember {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export async function fetchTeamMembers(): Promise<{ members: TeamMember[] }> {
  const { data } = await api.get('/api/settings/team');
  return data;
}

export async function inviteTeamMember(email: string, fullName: string): Promise<{
  userId: string;
  email: string;
  tempPassword: string;
  message: string;
}> {
  const { data } = await api.post('/api/settings/team/invite', { email, fullName });
  return data;
}

export async function removeTeamMember(userId: string): Promise<{ ok: boolean }> {
  const { data } = await api.delete(`/api/settings/team/${userId}`);
  return data;
}

// ── PodSignal — measurement taxonomy + output usage ─────────────────────────

export interface MeasurementTaxonomyResponse {
  evidenceLevels: readonly string[];
  claimVocabulary: Record<string, { verbs: string[]; nouns: string[] }>;
  outputUsageEventTypes: readonly string[];
}

export async function fetchMeasurementTaxonomy(): Promise<MeasurementTaxonomyResponse> {
  const { data } = await api.get<MeasurementTaxonomyResponse>('/api/podsignal/measurement-taxonomy');
  return data;
}

export async function postPodsignalOutputUsage(body: {
  eventType: string;
  episodeId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<{ ok: boolean }> {
  const { data } = await api.post<{ ok: boolean }>('/api/podsignal/output-usage', body);
  return data;
}

export interface PodsignalReportSummary {
  windowDays: number;
  generatedAt: string;
  outputUsageByType: Record<string, number>;
  outputUsageEventTotal: number;
  launchPackApprovalsObserved: number;
  trackableLinkClicksObserved: number;
  workspace: {
    shows: number;
    activeCampaigns: number;
    launchTasksDone: number;
    launchTasksTotal: number;
  };
  clicksByEpisode: {
    episodeId: string;
    episodeTitle: string;
    clicks: number;
    evidence: 'observed';
  }[];
  narrative: { headline: string; body: string };
  beforeAfterNarrative: string;
  likelyWorkedNarrative: string;
  evidenceGuide: {
    observed: string[];
    proxy: string[];
    estimated: string[];
    unsupported: string[];
  };
  evidenceScores: {
    observedActivation: number;
    launchExecution: number;
    sponsorProofStrength: number;
    breakdown: {
      observedActivation: Record<string, number>;
      launchExecution: Record<string, number>;
      sponsorProofStrength: Record<string, number>;
    };
  };
}

/** Rolling-window workspace summary; `evidenceScores` does not require Launch Evidence Graph migrations. */
export async function fetchPodsignalReportSummary(): Promise<PodsignalReportSummary> {
  const { data } = await api.get<PodsignalReportSummary>('/api/podsignal/report-summary');
  return data;
}

/** Download sponsor proof as PDF (sets filename via Content-Disposition). */
export async function downloadPodsignalSponsorReportPdf(): Promise<void> {
  const res = await api.get<ArrayBuffer>('/api/podsignal/sponsor-report.pdf', {
    responseType: 'arraybuffer',
  });
  const blob = new Blob([res.data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'podsignal-sponsor-proof.pdf';
  a.click();
  URL.revokeObjectURL(url);
}

export async function createPodsignalTrackableLink(body: {
  episodeId: string;
  assetKind: 'guest_share' | 'newsletter' | 'social' | 'launch' | 'other';
  channel?: string | null;
  targetUrl: string;
}): Promise<{
  id: string;
  token: string;
  publicUrl: string;
  episodeId: string;
  campaignId: string;
  assetKind: string;
  evidence: 'observed';
}> {
  const { data } = await api.post('/api/podsignal/trackable-links', body);
  return data;
}

export async function fetchPodsignalTrackableLinks(episodeId: string): Promise<{
  links: TrackableLinkSummary[];
}> {
  const { data } = await api.get<{ links: TrackableLinkSummary[] }>('/api/podsignal/trackable-links', {
    params: { episodeId },
  });
  return data;
}
