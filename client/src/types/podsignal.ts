export interface Podcast {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  artworkUrl: string | null;
  rssFeedUrl: string | null;
  spotifyId: string | null;
  applePodcastId: string | null;
  settings: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type EpisodeStatus =
  | 'DRAFT'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED'
  | 'PUBLISHED'
  | 'ARCHIVED';

export interface Episode {
  id: string;
  podcastId: string;
  title: string;
  description: string | null;
  audioUrl: string | null;
  /** Server-stored upload (relative path); use with GET or processing */
  audioLocalRelPath?: string | null;
  audioMimeType?: string | null;
  processingError?: string | null;
  durationSeconds: number | null;
  episodeNumber: number | null;
  seasonNumber: number | null;
  transcript: string | null;
  summary: string | null;
  chapters: unknown;
  status: EpisodeStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptSegmentRow {
  id: string;
  episodeId: string;
  seq: number;
  startMs: number;
  endMs: number;
  text: string;
  speaker: string | null;
  createdAt: string;
}

export interface EpisodeClipRow {
  id: string;
  episodeId: string;
  signalId: string | null;
  title: string;
  startSec: number;
  endSec: number;
  clipUrl: string | null;
  transcriptSnippet: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EpisodeDetail extends Episode {
  signals: unknown[];
  clips: EpisodeClipRow[];
  transcriptSegments: TranscriptSegmentRow[];
}

export interface PaginatedEpisodes {
  episodes: Episode[];
  total: number;
  limit: number;
  offset: number;
}

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';

export interface CampaignTask {
  id: string;
  campaignId: string;
  taskType: string;
  label: string;
  doneAt: string | null;
  sortOrder: number;
  createdAt: string;
}

/** Mirrors server `campaigns.launch_pack` JSON — selections + workflow state. */
export interface LaunchPackState {
  status?: 'draft' | 'approved' | 'exported' | 'measured';
  selectedTitleVariant?: string | null;
  selectedTitleIndex?: number | null;
  selectedAppleDescription?: string | null;
  selectedSpotifyDescription?: string | null;
  selectedClipIds?: string[];
  guestShareText?: string | null;
  channelNotes?: Record<string, string>;
  approvedAt?: string | null;
  exportedAt?: string | null;
  measuredAt?: string | null;
  updatedAt?: string | null;
}

export interface EpisodeCampaign {
  id: string;
  episodeId: string;
  status: CampaignStatus;
  utmCampaign: string | null;
  launchPack: LaunchPackState;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tasks: CampaignTask[];
}

export interface TrackableLinkSummary {
  id: string;
  token: string;
  episodeId: string;
  campaignId: string;
  assetKind: string;
  channel: string | null;
  targetUrl: string;
  clicksObserved: number;
  evidence: 'observed';
  createdAt: string;
  publicUrl: string;
}
