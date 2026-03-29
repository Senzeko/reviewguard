Yes — here are all three.

The core bet is still the same: **make the moat the evidence layer, not the generation layer**. That fits your brief, because the strongest part of PodSignal is not “AI makes assets,” it is **growth attribution + sponsor proof + launch workflow**. 

# 1) Technical architecture spec

## Name

**PodSignal Launch Evidence Graph**

## Purpose

A proprietary system that links:

* episode
* launch pack
* asset variants
* launch actions
* trackable links
* observed clicks
* launch windows
* manual/integrated performance snapshots
* guests
* topics
* sponsor outputs

…and turns them into:

* evidence-scored metrics
* sponsor-ready proof
* launch recommendations
* asset reranking over time

## Core product job

For your niche, the graph should answer:

**“What did we launch, what did PodSignal actually observe, what likely helped, and what should we repeat next time?”**

That directly supports the product brief’s core: episode intelligence, packaging, workflow, directional attribution, and sponsor reporting. 

---

## System principles

### A. Evidence before inference

Every metric must carry one of four evidence classes:

* **observed**
* **proxy**
* **estimated**
* **unsupported**

### B. First-party workflow advantage

Your moat comes from observing:

* which assets were generated
* which were selected
* which were copied/exported
* which links were created
* which redirects occurred
* which launch tasks were completed
* what changed during the launch window

### C. Workflow-native, not analytics-native

The graph should be fed by the **launch workflow itself**, not by trying to replace Spotify/Apple/YouTube analytics on day one.

### D. Rerank, don’t hallucinate

Use generation as a commodity layer.
Make the moat the **reranking + evidence scoring + sponsor proof compiler**.

---

## Architecture layers

## Layer 1 — Canonical launch graph

This is the source of truth.

### Core nodes

* `workspace`
* `show`
* `episode`
* `campaign`
* `launch_pack`
* `asset_variant`
* `clip_candidate`
* `trackable_link`
* `launch_task`
* `guest`
* `topic`
* `performance_snapshot`
* `output_usage_event`
* `redirect_click`
* `sponsor_report_export`

### Core edges

* episode → has many → asset_variants
* episode → has many → clip_candidates
* episode → belongs to → campaign
* campaign → contains → launch_pack
* launch_pack → selects → asset_variants
* launch_pack → approves → clip_candidates
* campaign → has many → launch_tasks
* asset_variant → may produce → trackable_link
* trackable_link → receives → redirect_clicks
* episode → linked to → guests/topics
* episode/campaign → summarized by → performance_snapshots
* report_export → derived from → launch window + graph state

---

## Layer 2 — Event ingestion

This records what happened.

### Event families

1. **generation events**

   * transcript_generated
   * chapters_generated
   * titles_generated
   * clips_generated
   * guest_share_generated

2. **selection events**

   * title_option_selected
   * clip_candidate_approved
   * metadata_variant_selected

3. **usage events**

   * guest_share_copied
   * newsletter_copy_copied
   * social_variant_copied
   * launch_asset_copied
   * sponsor_one_pager_exported

4. **workflow events**

   * launch_pack_approved
   * campaign_checklist_task_done
   * campaign_status_changed

5. **link events**

   * trackable_link_created
   * redirect_click_logged

6. **snapshot events**

   * performance_snapshot_recorded
   * manual_snapshot_added
   * host_snapshot_imported

---

## Layer 3 — Evidence scoring engine

This is the private methodology.

For every insight, the engine assigns:

* `evidence_class`
* `confidence_band`
* `claim_language`
* `supporting_observations`
* `forbidden_claims`

### Example scoring rules

#### Metric: asset click count

* class: `observed`
* confidence: `high`
* language: “PodSignal observed 41 redirect clicks”
* forbidden: “41 listeners came from this asset”

#### Metric: episode play uplift after launch

* class: `proxy`
* confidence: `medium`
* language: “Episode plays increased during the 7-day launch window”
* forbidden: “The launch pack caused this increase”

#### Metric: guest amplification signal

* class: `estimated`
* confidence: `low-to-medium`
* language: “Guest-share activity is likely associated with stronger observed launch activity”
* forbidden: “This guest drove exact subscriber growth”

---

## Layer 4 — Insight compiler

This creates:

* dashboard summaries
* episode launch summaries
* sponsor/launch reports
* next-launch suggestions

### Example outputs

* “2 of 5 generated title options were selected across the last 3 launches”
* “Guest-share links produced 28 observed redirect clicks during this launch window”
* “Clip approval rate is higher for quote-led clips than summary clips on this show”
* “This report includes observed launch activity and directional signals, not full platform attribution”

---

## Layer 5 — Reranking engine

This is where the moat compounds.

Over time, rerank:

* title variants
* clip candidates
* guest-share assets
* launch sequences
* sponsor-proof summaries

### Inputs

* selection rates
* copy/export rates
* click rates
* checklist completion patterns
* launch window patterns
* guest/topic context
* show format context

### Output

Not:

* “this title will win”

Instead:

* “for interview episodes on this show, question-led YouTube titles are more often selected and more often associated with stronger observed launch activity”

---

## Minimum scoring primitives to implement first

### 1. Observed Activation Score

Measures actual product-observed activity for a launch:

* selected assets
* copied assets
* exported assets
* created links
* clicks
* completed tasks

### 2. Launch Completion Score

Measures execution quality:

* draft → approved → distributed → measured
* percentage of planned tasks completed
* pack completeness

### 3. Guest Amplification Signal

Measures:

* whether guest-share assets were used
* whether guest-share links were clicked
* whether guest-linked launches have stronger observed activity over repeated runs

### 4. Sponsor Proof Strength

Measures how much of the report is grounded in observed data vs proxy/inference.

---

## Data flow

### Step 1

Episode is uploaded or opened

### Step 2

Transcript/chapters/clips/titles/assets are generated

### Step 3

User selects, approves, copies, exports

### Step 4

Campaign/launch pack becomes approved

### Step 5

Trackable links are created and distributed

### Step 6

Redirects are observed

### Step 7

Optional manual or integrated snapshots are added

### Step 8

Evidence engine scores the launch window

### Step 9

Report compiler generates sponsor-ready proof

---

## Sync vs async

### Sync

* output usage writes
* link creation
* redirect logging
* checklist updates
* launch pack state
* report summary fetch

### Async

* transcript generation
* clip generation
* packaging generation
* reranking jobs
* periodic launch window summaries
* PDF generation later

---

## What is actually proprietary

Not the LLM.

The proprietary part is:

1. **graph schema**
2. **event taxonomy**
3. **evidence scoring rules**
4. **niche-specific reranking logic**
5. **report compiler language rules**

That is the part you should brand and keep internal.

---

# 2) File / schema / API plan for your current repo

This is based on the repo state you already described:

* `src/podsignal/domain.ts`
* `src/podsignal/measurement.ts`
* `src/server/routes/podsignal.ts`
* `campaigns.launch_pack`
* `podsignal_output_usage`
* `podsignal_trackable_links`
* `podsignal_link_clicks`
* current report summary/export path
* Dashboard / Episode Launch / Episode Detail / Sponsor Reports surfaces

So the next move is not to invent a brand-new system. It is to **extend the foundation you already have into the full Launch Evidence Graph**.

---

## A. New server modules

### `src/podsignal/launchEvidenceGraph.ts`

Purpose:

* central graph builder / resolver
* map campaign, episode, assets, links, clicks, snapshots into one launch evidence object

Exports:

* `buildLaunchEvidenceGraph(...)`
* `getLaunchWindowContext(...)`
* `getObservedUsageSummary(...)`
* `getObservedLinkSummary(...)`

### `src/podsignal/evidenceScoring.ts`

Purpose:

* assign evidence class and confidence
* enforce safe claim language

Exports:

* `classifyMetricEvidence(...)`
* `scoreLaunchEvidence(...)`
* `getClaimLanguage(...)`
* `containsForbiddenCausalClaim(...)`

### `src/podsignal/reranking.ts`

Purpose:

* rerank title/clip/asset candidates using historical usage patterns

Exports:

* `rankTitleVariants(...)`
* `rankClipCandidates(...)`
* `rankLaunchAssets(...)`

### `src/podsignal/reportCompiler.ts`

Purpose:

* produce structured sponsor-proof and launch-proof output from graph + scoring

Exports:

* `buildLaunchProofReport(...)`
* `buildSponsorProofSummary(...)`

### `src/podsignal/eventTaxonomy.ts`

Purpose:

* one source of truth for event names and categories

---

## B. Schema changes

You already have:

* `campaigns.launch_pack`
* `podsignal_output_usage`
* `podsignal_trackable_links`
* `podsignal_link_clicks`

Add these next.

### 1. `podsignal_asset_variants`

Purpose:
store all generated/selectable assets as first-class objects

Columns:

* `id`
* `workspace_id`
* `show_id`
* `episode_id`
* `campaign_id`
* `asset_type`
  (`youtube_title`, `apple_title`, `spotify_description`, `guest_share_email`, `newsletter_copy`, `social_post`, `clip_caption`, etc.)
* `channel`
* `variant_key`
* `content_json`
* `source_generation_version`
* `created_at`

Why:
Right now some assets may only exist in JSON blobs. First-class asset rows will make lineage and reranking much stronger.

### 2. `podsignal_launch_windows`

Columns:

* `id`
* `workspace_id`
* `episode_id`
* `campaign_id`
* `window_start`
* `window_end`
* `window_type` (`7_day`, `30_day`, `custom`)
* `status`

Why:
lets you anchor reports and observed metrics to a canonical window.

### 3. `podsignal_performance_snapshots`

Columns:

* `id`
* `workspace_id`
* `episode_id`
* `campaign_id`
* `source` (`manual`, `spotify_manual`, `youtube_manual`, `apple_manual`, `internal`)
* `snapshot_type` (`plays`, `views`, `subs`, `retention`, etc.)
* `metric_name`
* `metric_value`
* `captured_at`
* `evidence_class` default `proxy`
* `notes`

Why:
lets you support “manual snapshots” honestly before deep integrations.

### 4. `podsignal_guest_topic_links`

Columns:

* `id`
* `episode_id`
* `guest_name`
* `guest_org`
* `topic_label`
* `confidence`
* `source`

Why:
needed for guest/topic amplification later.

### 5. `podsignal_report_exports`

Columns:

* `id`
* `workspace_id`
* `episode_id`
* `campaign_id`
* `report_type`
* `export_format`
* `exported_by`
* `exported_at`

Why:
turn report usage into part of the evidence graph.

---

## C. API plan

## Existing route to extend

### `GET /api/podsignal/report-summary`

Keep it, but structure it around:

* launch window
* evidence sections
* observed metrics
* proxy metrics
* estimated insights
* unsupported notes
* sponsor-safe narrative

---

## New routes

### `GET /api/podsignal/launch-evidence/:episodeId`

Returns:

* launch pack summary
* asset variants
* selected assets
* usage events
* link stats
* evidence breakdown
* launch scores

### `POST /api/podsignal/asset-variants`

Create/store generated assets as first-class variants

### `GET /api/podsignal/asset-variants?episodeId=...`

List variants by episode/campaign

### `PATCH /api/podsignal/launch-pack/:campaignId`

Select approved variants, state transitions, timestamps

### `POST /api/podsignal/performance-snapshots`

Add manual or imported platform snapshots

### `GET /api/podsignal/performance-snapshots?episodeId=...`

List snapshots for report context

### `GET /api/podsignal/launch-insights/:episodeId`

Returns evidence-scored insights:

* observed
* proxy
* estimated
* unsupported

### `POST /api/podsignal/report-exports`

Log export events for TXT/PDF/etc.

### `GET /api/podsignal/reranked-recommendations/:episodeId`

Returns reranked:

* titles
* clips
* launch assets
  based on show history and graph patterns

---

## D. Current file-level next steps

### Backend

* extend `src/db/schema.ts`
* add migration `0014_launch_evidence_graph.sql`
* add `scripts/apply-migration-0014.ts`
* update `src/server/routes/podsignal.ts`
* update `src/server/routes/campaigns.ts`
* add `src/podsignal/launchEvidenceGraph.ts`
* add `src/podsignal/evidenceScoring.ts`
* add `src/podsignal/reportCompiler.ts`
* add `src/podsignal/reranking.ts`
* add `src/podsignal/eventTaxonomy.ts`

### Frontend

* add `client/src/domain/launchEvidence.ts`
* add `client/src/components/EvidenceBadge.tsx`
* add `client/src/components/LaunchEvidencePanel.tsx`
* add `client/src/components/ReportEvidenceGuide.tsx`
* update:

  * `EpisodeLaunchPage.tsx`
  * `EpisodeDetailPage.tsx`
  * `DashboardPage.tsx`
  * `SponsorReportsPlaceholder.tsx`

---

## E. Frontend behavior changes

### Episode detail

Show:

* generated assets
* selected assets
* approved clips
* evidence labels
* launch readiness

### Episode launch

Show:

* launch pack as a first-class object
* selected title / clip / guest-share assets
* trackable links
* launch task progress
* “observed so far” section

### Dashboard

Show:

* recent launches
* observed activity
* directional signals
* report export history
* “illustrative” only where still necessary

### Reports

Show:

* executive summary
* observed activity
* proxy/supporting context
* what likely worked
* what to repeat
* clear evidence guide

---

## F. Scoring rules to implement in code first

### `ObservedActivationScore`

Weighted from:

* asset selections
* asset copies/exports
* launch approvals
* links created
* clicks logged
* report exports

### `LaunchExecutionScore`

Weighted from:

* checklist completion
* approved launch pack completeness
* distributed assets count
* link coverage across selected channels

### `SponsorProofStrength`

Weighted from:

* percentage of report metrics that are observed
* number of observed clicks
* presence of launch window context
* exportable narrative quality inputs

---

## G. Test plan for this layer

### Unit

* evidence classification rules
* forbidden claim detection
* launch window calculations
* reranking logic with deterministic fixtures

### Contract

* `/api/podsignal/launch-evidence/:episodeId`
* `/api/podsignal/performance-snapshots`
* `/api/podsignal/reranked-recommendations/:episodeId`

### Integration

* asset variant creation → launch pack selection → report summary
* trackable link creation → redirect → evidence graph refresh

### E2E

* select title
* approve clip
* create link
* open redirect
* export report
* verify evidence-labeled summary changed

---

# 3) Cursor prompt to start implementing it

Paste this into Cursor:

```text id="cursor-launch-evidence-graph"
Act as a Principal Staff Engineer for Podcast Growth Attribution Systems.

Your job is to implement PodSignal’s next proprietary moat layer:
the PodSignal Launch Evidence Graph.

This is not a broad architecture rewrite.
This is a focused implementation pass on top of the existing PodSignal foundation already in this repo.

Current repo state to preserve:
- PodSignal domain and measurement primitives already exist
- output usage tracking exists
- launch_pack exists on campaigns
- trackable links and redirect logging exist
- report summary/export exists
- observed/proxy/estimated honesty language already exists in the product
- active surfaces include Dashboard, Episode Detail, Episode Launch, Sponsor Reports, onboarding/auth/billing

Goal:
Turn the current PodSignal foundation into a real Launch Evidence Graph that becomes the source of truth for:
1. evidence-scored launch reporting
2. asset lineage and usage
3. sponsor-proof generation
4. future reranking and launch recommendations

Core product thesis:
PodSignal is the launch-and-proof layer for video-first business podcasts.
The moat is not generic AI generation.
The moat is the structured evidence graph that links episode launch actions, asset usage, observed clicks, launch windows, and sponsor-safe reporting.

Scientific rules:
Every metric or insight must be explicitly classified as:
- observed
- proxy
- estimated
- unsupported

Do not overclaim causality.
Do not imply exact listener truth where only asset/link observation exists.
Prefer:
- observed
- directional
- estimated
- likely associated with

Never:
- caused
- proved
- exactly drove
unless directly supported by observed data.

IMPLEMENTATION OBJECTIVES

PHASE 1 — Graph foundation
Implement a Launch Evidence Graph layer on top of the existing schema and APIs.

Add or formalize these server modules:
- src/podsignal/launchEvidenceGraph.ts
- src/podsignal/evidenceScoring.ts
- src/podsignal/reportCompiler.ts
- src/podsignal/eventTaxonomy.ts

Responsibilities:
- aggregate campaign, launch_pack, output_usage, trackable_links, link_clicks, and report exports
- produce a canonical launch evidence object for an episode/campaign
- classify evidence strength for each metric
- produce sponsor-safe claim language
- centralize the event taxonomy

PHASE 2 — Schema expansion
Extend the current DB schema with the smallest safe additions needed for a real evidence graph.

Add:
1. podsignal_asset_variants
2. podsignal_launch_windows
3. podsignal_performance_snapshots
4. podsignal_guest_topic_links
5. podsignal_report_exports

Also add the migration and apply script.

Requirements:
- keep naming aligned to PodSignal, not legacy business domains
- preserve existing tables and routes
- avoid destructive changes
- make the new schema useful immediately for the MVP

PHASE 3 — API expansion
Extend PodSignal APIs with the smallest safe set of endpoints needed for the graph.

Add:
- GET /api/podsignal/launch-evidence/:episodeId
- POST /api/podsignal/asset-variants
- GET /api/podsignal/asset-variants?episodeId=...
- PATCH /api/podsignal/launch-pack/:campaignId
- POST /api/podsignal/performance-snapshots
- GET /api/podsignal/performance-snapshots?episodeId=...
- POST /api/podsignal/report-exports
- GET /api/podsignal/reranked-recommendations/:episodeId

Preserve and improve:
- GET /api/podsignal/report-summary
- GET /api/podsignal/measurement-taxonomy

Requirements:
- define clear request/response contracts
- include evidence metadata where appropriate
- keep the API honest and sponsor-safe

PHASE 4 — Frontend alignment
Update the active product surfaces to use the graph.

Focus on:
- EpisodeDetailPage.tsx
- EpisodeLaunchPage.tsx
- DashboardPage.tsx
- SponsorReportsPlaceholder.tsx

Add or update components so the UI can show:
- selected vs generated assets
- evidence badges
- launch readiness
- observed activity
- launch window summary
- sponsor-proof evidence guide

Add frontend modules:
- client/src/domain/launchEvidence.ts
- client/src/components/EvidenceBadge.tsx
- client/src/components/LaunchEvidencePanel.tsx
- client/src/components/ReportEvidenceGuide.tsx

PHASE 5 — Scoring primitives
Implement these first:
- ObservedActivationScore
- LaunchExecutionScore
- SponsorProofStrength

These should be deterministic and explainable.
Do not introduce black-box scoring.

PHASE 6 — Reranking foundation
Add a small deterministic reranking layer:
- rankTitleVariants
- rankClipCandidates
- rankLaunchAssets

Use historical selection/use patterns only where data exists.
Do not pretend to have strong recommendations without evidence.

DELIVERABLES
Return in this format:

A. Launch Evidence Graph design summary
B. Exact schema changes
C. Exact API changes
D. File-by-file implementation plan
E. Implemented code changes
F. Tests added or updated
G. Remaining gaps / deferrals

SUCCESS CRITERIA
By the end of this pass:
- PodSignal has a real canonical launch evidence object
- asset usage and launch events are connected in one model
- reports are generated from a stronger evidence layer
- evidence classes are enforced in code
- the foundation for reranking exists
- the moat is more defensible than generic content generation

Rules:
- use the actual repo and current PodSignal foundation
- do not reopen unrelated architecture work
- do not drift into generic analytics sprawl
- do not delete legacy DB tables unless proven safe
- preserve working auth, billing, tracking, and current routes
- make real code changes, not just abstract planning

Start with a brief repo fit check, then implement Phase 1 and Phase 2 first.
```

---

# My blunt recommendation

If you only build **one** proprietary system, build this one.

Because this is the part that can become:

* technically unique
* product-defining
* scientifically honest
* hard to copy
* crucial to your repositioning toward **video-first business podcasts** and **sponsor-proof launch workflows**.