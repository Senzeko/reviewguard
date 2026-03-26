import axios from 'axios';
import type { ConsoleInvestigationResponse } from '../types/investigation';
import type { OnboardingState, DashboardStats, PaginatedInvestigations } from '../types/auth';

export const api = axios.create({
  baseURL: '/',
  withCredentials: true,
});

// Redirect to /login on 401 (except for /api/auth/me which is expected to 401)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (
      err.response?.status === 401 &&
      !err.config?.url?.includes('/api/auth/me') &&
      !err.config?.url?.includes('/api/auth/login') &&
      !err.config?.url?.includes('/api/auth/signup')
    ) {
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

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
