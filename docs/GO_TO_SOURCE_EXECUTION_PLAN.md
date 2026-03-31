# PodSignal Go-To Source Execution Plan

## Objective
Make PodSignal the default system teams trust for turning episodes into sponsor-ready proof quickly, consistently, and credibly.

## Sprint Backlog (30 Days)

### Sprint 1 (Week 1): Reliability + Signature Outcome
- [x] Add a visible Launch Proof Scorecard to `EpisodeLaunchPage` (execution, activation, sponsor proof).
- [ ] Add "data freshness" chips on key pages (`EpisodeDetailPage`, `EpisodeLaunchPage`, `PodSignalAnalytics`).
- [ ] Add one-click recovery actions for common failures (retry processing, refresh campaign, regenerate title set).
- [ ] Add empty/error state QA checklist and lock with E2E assertions.

### Sprint 2 (Week 2): Sponsor-Facing Assets
- [ ] Create sponsor-facing one-pager export with evidence classes (`observed`, `proxy`, `estimated`, `unsupported`).
- [ ] Add report template presets by persona: host, producer, sponsor.
- [ ] Add explicit "what this proves / does not prove" language to all exports.

### Sprint 3 (Week 3): Recommendation Quality Moat
- [x] Ship title tone presets (`balanced`, `authority`, `curiosity`, `contrarian`, `practical`).
- [ ] Add niche presets (B2B, creator economy, wellness, finance, tech, media) and pass through title generation.
- [ ] Track recommendation lift metrics: selected variant rate, save rate, downstream click rate.

### Sprint 4 (Week 4): Activation and Adoption
- [ ] Build a 10-minute onboarding path with hard milestones:
  1) first show created
  2) first episode processed
  3) first launch pack approved
  4) first sponsor report exported
- [ ] Add onboarding progress bar and "next best action" CTA on dashboard.
- [ ] Add a "first week wins" summary email using observed in-product events.

## KPI Targets
- Activation: >= 60% of new workspaces generate first proof report in 24h.
- Retention: >= 45% weekly active workspaces process at least one episode.
- Output adoption: >= 70% processed episodes select at least one recommended title/asset.
- Trust: 100% sponsor-facing metrics labeled by evidence class.
- Conversion: >= 20% trial-to-paid after first sponsor-proof export.

## Product Principles
- Proof over promises: always separate observed from inferred outcomes.
- Time-to-value over completeness: optimize for first meaningful result in one session.
- Repeatability over hero workflows: every winning output should be reproducible by checklist.
- Reliability as product quality: clear status, clear fallback, clear recovery.
