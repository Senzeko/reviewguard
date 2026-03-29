/**
 * Pure helpers for pilot launch proof copy — testable without DB.
 */

export interface ExecutiveNarrativeInput {
  windowDays: number;
  trackableLinkClicksObserved: number;
  outputUsageEventTotal: number;
  launchPackApprovalsObserved: number;
}

/** Factual headline + body — counts only, no invented lift or causality. */
export function buildExecutiveNarrative(i: ExecutiveNarrativeInput): { headline: string; body: string } {
  const hasActivity =
    i.trackableLinkClicksObserved > 0 || i.outputUsageEventTotal > 0 || i.launchPackApprovalsObserved > 0;

  const headline = hasActivity
    ? 'Launch proof — what PodSignal observed in your workspace'
    : 'Launch proof — workspace ready for activity';

  const body = hasActivity
    ? `In the last ${i.windowDays} days, PodSignal recorded ${i.trackableLinkClicksObserved} short-link redirect hit(s), ${i.outputUsageEventTotal} in-app usage event(s), and ${i.launchPackApprovalsObserved} launch-pack approval event(s). These figures come only from PodSignal — not Spotify, Apple, YouTube, or ad dashboards.`
    : `In the last ${i.windowDays} days, PodSignal has not yet recorded short-link clicks or in-app usage in this workspace (or counts are zero). As you approve launch packs, copy assets, complete checklist items, and share trackable links, this summary will fill in — still without claiming host-platform audience totals.`;

  return { headline, body };
}

export interface PilotReportNarrativeInput {
  windowDays: number;
  trackableLinkClicksObserved: number;
  outputUsageEventTotal: number;
  launchPackApprovalsObserved: number;
  activeCampaignsApprox: number;
  launchTasksDone: number;
  launchTasksTotal: number;
}

export function buildBeforeAfterNarrative(i: PilotReportNarrativeInput): string {
  const parts: string[] = [];

  parts.push(
    `• Reporting window: last ${i.windowDays} days. All counts below are PodSignal-observed unless labeled proxy.`,
    `• Before you distribute: titles, copy, trackable links, and approvals live in PodSignal; saves, copies, and approvals show up as usage events.`,
    `• After you share links: ${i.trackableLinkClicksObserved} redirect hit(s) in this window — each hit is someone opening your PodSignal short URL, not a play or download on a host platform.`,
  );

  if (i.launchPackApprovalsObserved > 0) {
    parts.push(`• Launch pack approvals recorded in-app: ${i.launchPackApprovalsObserved}.`);
  }

  if (i.launchTasksTotal > 0) {
    const pct = Math.round((i.launchTasksDone / i.launchTasksTotal) * 100);
    parts.push(
      `• Checklist (proxy — operational follow-through, not audience): ${i.launchTasksDone} of ${i.launchTasksTotal} tasks marked done (${pct}% rounded).`,
    );
  }

  if (i.activeCampaignsApprox > 0) {
    parts.push(`• Campaigns with status ACTIVE in this workspace: ${i.activeCampaignsApprox}.`);
  }

  parts.push(
    `• Listener, subscriber, and ad-attribution numbers from Spotify/Apple/YouTube are not included here unless you attach separate verified sources.`,
  );

  return parts.join('\n');
}

export interface LikelyWorkedInput extends PilotReportNarrativeInput {
  outputUsageByType: Record<string, number>;
}

/**
 * Honest, directional “what likely worked” from observed in-app + link signals only.
 */
export function buildLikelyWorkedNarrative(i: LikelyWorkedInput): string {
  const bullets: string[] = [];

  if (i.trackableLinkClicksObserved > 0) {
    bullets.push(
      `• ${i.trackableLinkClicksObserved} short-link redirect hit(s) — real opens of your PodSignal URLs toward your destination; not unique listeners and not host play counts.`,
    );
  }

  const copyEvents =
    (i.outputUsageByType['guest_share_copied'] ?? 0) +
    (i.outputUsageByType['newsletter_copy_copied'] ?? 0) +
    (i.outputUsageByType['social_variant_copied'] ?? 0);
  if (copyEvents > 0) {
    bullets.push(
      `• ${copyEvents} channel copy action(s) (guest / newsletter / social) recorded in-app — shows you used generated text; PodSignal does not see where you pasted it.`,
    );
  }

  const checklist = i.outputUsageByType['campaign_checklist_task_done'] ?? 0;
  if (checklist > 0) {
    bullets.push(`• ${checklist} checklist completion(s) — directional signal of launch follow-through, not reach.`);
  }

  if (i.launchPackApprovalsObserved > 0) {
    bullets.push(
      `• ${i.launchPackApprovalsObserved} launch-pack approval(s) — packaging was explicitly signed off in the product.`,
    );
  }

  if (bullets.length === 0) {
    bullets.push(
      '• Too little activity in this window to summarize patterns. Approve a pack, create links, copy assets, and complete checklist items — then refresh this report.',
    );
  }

  bullets.push(
    '• These signals do not prove platform audience growth or revenue from assets alone — they only list what PodSignal recorded.',
  );

  return bullets.join('\n');
}
