/**
 * PodSignal MVP core domain — TypeScript contracts (schema lives in src/db/schema.ts).
 *
 * Ruthless MVP: one episode → 7-day measurable launch campaign → directional signals → sponsor proof.
 */

import type { EvidenceStrength } from './measurement.js';

/** Workspace ≈ merchant row after onboarding; user may own multiple shows */
export interface Workspace {
  id: string;
  name: string;
  ownerUserId: string;
}

/** Podcast show */
export interface Show {
  id: string;
  workspaceId: string;
  title: string;
  description: string | null;
}

export interface Episode {
  id: string;
  showId: string;
  title: string;
  status: string;
  transcriptPresent: boolean;
  chaptersPresent: boolean;
}

export interface ClipCandidate {
  id: string;
  episodeId: string;
  title: string;
  startSec: number;
  endSec: number;
}

/** Approved packaging bundle (titles, copy variants) — often JSON in DB */
export interface LaunchPack {
  id: string;
  episodeId: string;
  approvedAt: string | null;
}

export interface Campaign {
  id: string;
  episodeId: string;
  status: string;
  utmCampaign: string | null;
}

export interface CampaignTask {
  id: string;
  campaignId: string;
  label: string;
  doneAt: string | null;
}

/** Single ingested analytics row — always carries evidence strength */
export interface AttributionEvent {
  id: string;
  campaignId: string | null;
  episodeId: string | null;
  eventType: string;
  occurredAt: string;
  meta: Record<string, unknown>;
  evidence: EvidenceStrength;
}

export interface PerformanceSnapshot {
  episodeId: string;
  windowLabel: string;
  metrics: Record<string, number | string | null>;
  evidence: EvidenceStrength;
}
