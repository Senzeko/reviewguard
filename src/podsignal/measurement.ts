/**
 * PodSignal — scientifically honest measurement model (code-enforced taxonomy).
 *
 * Every metric or narrative shown to users must map to one of these evidence levels.
 * UI copy must use vocabulary from CLAIM_VOCABULARY for that level — never imply
 * unsupported causality.
 */

/** How the value was obtained */
export type EvidenceStrength = 'observed' | 'proxy' | 'inferred' | 'unsupported';

/** Optional finer classification for analytics pipelines */
export type SignalProvenance =
  | 'direct_click'
  | 'direct_export'
  | 'direct_upload'
  | 'pipeline_status'
  | 'windowed_aggregate'
  | 'baseline_comparison'
  | 'model_estimate'
  | 'third_party_unverified';

/** Safe words/phrases for user-facing analytics (by evidence level) */
export const CLAIM_VOCABULARY: Record<EvidenceStrength, { verbs: string[]; nouns: string[] }> = {
  observed: {
    verbs: ['observed', 'recorded', 'counted', 'exported', 'selected'],
    nouns: ['clicks on PodSignal links', 'exports', 'checklist completions', 'uploads'],
  },
  proxy: {
    verbs: ['directionally associated with', 'rose after', 'trended with'],
    nouns: ['launch window activity', 'relative performance'],
  },
  inferred: {
    verbs: ['estimated', 'likely associated with', 'suggested by patterns in'],
    nouns: ['modeled lift', 'directional signal'],
  },
  unsupported: {
    verbs: ['not measured in PodSignal', 'cannot be attributed from available data'],
    nouns: ['platform-native metrics without tracked path'],
  },
};

/** Phrases that must not appear in user-facing PodSignal analytics unless evidence is observed + validated */
export const FORBIDDEN_CAUSAL_CLAIMS = [
  /\bcaused\b/i,
  /\bproved\b/i,
  /\bproves\b/i,
  /\bexactly drove\b/i,
  /\bguaranteed\b/i,
  /\b100%\s+of\b.*\blisteners\b/i,
] as const;

/**
 * Returns whether copy is safe for production analytics surfaces.
 * Logs nothing — use at build time in tests or optional dev assertions.
 */
export function containsForbiddenCausalClaim(text: string): boolean {
  return FORBIDDEN_CAUSAL_CLAIMS.some((re) => re.test(text));
}

/** Default evidence level for PodSignal dashboard KPIs until wired to real events */
export const DEFAULT_DASHBOARD_KPI_EVIDENCE: EvidenceStrength = 'inferred';

/** Event types for output-usage tracking (selected / exported / approved assets) */
export const OUTPUT_USAGE_EVENT_TYPES = [
  'title_option_selected',
  'clip_candidate_approved',
  'clip_candidate_rejected',
  'launch_pack_approved',
  'guest_share_copied',
  'guest_share_exported',
  'newsletter_copy_copied',
  'social_variant_copied',
  'sponsor_report_exported',
  'sponsor_one_pager_exported',
  'campaign_checklist_task_done',
  'trackable_link_created',
  /** Generic copy of a launch packaging block (not guest-specific or channel-specific). */
  'launch_asset_copied',
  /** Design-partner learning: key surfaces viewed (dedupe on client). */
  'sponsor_report_page_viewed',
  'episode_launch_page_viewed',
  'episode_detail_page_viewed',
  /** Navigation intent from pilot chrome (dashboard, layout). */
  'pilot_ui_nav',
  /** Growth / analytics surface (dedupe per session on client). */
  'analytics_page_viewed',
  /** User saved a self-reported host-platform metric row on Analytics. */
  'host_metric_snapshot_logged',
] as const;

export type OutputUsageEventType = (typeof OUTPUT_USAGE_EVENT_TYPES)[number];
