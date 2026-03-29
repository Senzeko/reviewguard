/**
 * Closed-beta measurement loop: every event emitted from shipped UI or trackable-link
 * creation must be in OUTPUT_USAGE_EVENT_TYPES (API rejects unknown types).
 */
import { describe, it, expect } from 'vitest';
import { OUTPUT_USAGE_EVENT_TYPES } from './measurement.js';

const ALLOWED = new Set<string>(OUTPUT_USAGE_EVENT_TYPES);

/** Emitted via client `trackOutputUsage` (grep-maintained). */
const CLIENT_EMITTED: string[] = [
  'episode_detail_page_viewed',
  'episode_launch_page_viewed',
  'title_option_selected',
  'clip_candidate_approved',
  'launch_pack_approved',
  'guest_share_copied',
  'newsletter_copy_copied',
  'social_variant_copied',
  'launch_asset_copied',
  'campaign_checklist_task_done',
  'sponsor_report_page_viewed',
  'sponsor_one_pager_exported',
  'pilot_ui_nav',
  'analytics_page_viewed',
  'host_metric_snapshot_logged',
];

/** Emitted server-side on POST /api/podsignal/trackable-links (not duplicated on client). */
const SERVER_ONLY_EMITTED: string[] = ['trackable_link_created'];

describe('measurement UI ↔ taxonomy contract', () => {
  it('includes every client-emitted output-usage event type', () => {
    for (const e of CLIENT_EMITTED) {
      expect(ALLOWED.has(e), `${e} missing from OUTPUT_USAGE_EVENT_TYPES`).toBe(true);
    }
  });

  it('includes server-emitted trackable_link_created', () => {
    expect(ALLOWED.has('trackable_link_created')).toBe(true);
  });

  it('lists server-only emitters separately from client list', () => {
    for (const e of SERVER_ONLY_EMITTED) {
      expect(ALLOWED.has(e)).toBe(true);
    }
  });
});
