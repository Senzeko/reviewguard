/**
 * Shared payload for GET /api/podsignal/report-summary and sponsor-report.pdf.
 *
 * Rolling-window aggregates only. `evidenceScores` does not imply migration 0017 graph tables
 * are present; full graph + export lineage columns need 0017/0018 (see docs/PODSIGNAL_SNAPSHOTS_AND_REPORTS.md).
 */

export interface WorkspaceEvidenceScores {
  observedActivation: number;
  launchExecution: number;
  sponsorProofStrength: number;
  breakdown: {
    observedActivation: Record<string, number>;
    launchExecution: Record<string, number>;
    sponsorProofStrength: Record<string, number>;
  };
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
  /** Rolling-window composite scores (deterministic; Launch Evidence Graph v1). */
  evidenceScores: WorkspaceEvidenceScores;
}
