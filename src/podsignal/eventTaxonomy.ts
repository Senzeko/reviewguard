/**
 * Launch Evidence Graph — single taxonomy for event families and output-usage mapping.
 * Generation/selection/usage/workflow/link/snapshot families align with the product spec.
 */

import { OUTPUT_USAGE_EVENT_TYPES, type OutputUsageEventType } from './measurement.js';

export const GRAPH_EVENT_FAMILIES = [
  'generation',
  'selection',
  'usage',
  'workflow',
  'link',
  'snapshot',
  'navigation',
  'other',
] as const;

export type GraphEventFamily = (typeof GRAPH_EVENT_FAMILIES)[number];

const USAGE_TO_FAMILY: Partial<Record<OutputUsageEventType, GraphEventFamily>> = {
  title_option_selected: 'selection',
  clip_candidate_approved: 'selection',
  clip_candidate_rejected: 'selection',
  launch_pack_approved: 'workflow',
  guest_share_copied: 'usage',
  guest_share_exported: 'usage',
  newsletter_copy_copied: 'usage',
  social_variant_copied: 'usage',
  sponsor_report_exported: 'usage',
  sponsor_one_pager_exported: 'usage',
  campaign_checklist_task_done: 'workflow',
  trackable_link_created: 'link',
  launch_asset_copied: 'usage',
  sponsor_report_page_viewed: 'navigation',
  episode_launch_page_viewed: 'navigation',
  episode_detail_page_viewed: 'navigation',
  pilot_ui_nav: 'navigation',
  analytics_page_viewed: 'navigation',
  host_metric_snapshot_logged: 'snapshot',
};

/** Map a recorded output-usage event type to its graph family. */
export function outputUsageEventToFamily(eventType: string): GraphEventFamily {
  const f = USAGE_TO_FAMILY[eventType as OutputUsageEventType];
  if (f) return f;
  if ((OUTPUT_USAGE_EVENT_TYPES as readonly string[]).includes(eventType)) return 'other';
  return 'other';
}

/** Event names reserved for future ingestion (transcript_generated, etc.) — not yet in output_usage. */
export const PLANNED_GENERATION_EVENTS = [
  'transcript_generated',
  'chapters_generated',
  'titles_generated',
  'clips_generated',
  'guest_share_generated',
] as const;
