# PodSignal — build roadmap (from ReviewGuard pivot)

Living document. **Source of truth for code** remains the repo; this tracks intent, order, and acceptance criteria.

## Current state (snapshot)

| Area | Status |
|------|--------|
| Auth, sessions | Kept (`merchant_users`, cookies) |
| Legacy ReviewGuard | Gated by `LEGACY_REVIEWGUARD`; webhook/POS/engine/scheduler off when `false` |
| Data | `podcasts`, `episodes`, `signals`, `clips` (migration `0007`) |
| API | `/api/podcasts`, `/api/episodes`, `POST .../process`, `POST .../audio` (multipart) |
| Worker | `PODSIGNAL` + AssemblyAI or stub transcription; `episode:failed` SSE |
| SSE | `broadcastToUser` + legacy `broadcastSSE`; `/api/sse/events` works without merchant |
| Client | Episode page: upload, URL, segments table, failed state |
| Billing | Still review-oriented in DB; not yet aligned to episodes |
| Launch (Phase B) | `campaigns` + `campaign_tasks`; `/episodes/:id/launch` |

---

## Guiding sequence

1. **Intelligence on real media** (transcription + segments) — unlocks everything else.  
2. **Launch workflow** (campaigns) — differentiator vs “AI copy” tools.  
3. **Measurement** (attribution v0) — moat narrative.  
4. **Sponsor outputs** (PDF/report) — monetization proof.  
5. **Billing + limits** — sustainable unit economics.  
6. **Hardening** (storage, tests, observability).

---

## Phase A — Real episode processing (P0) — **implemented (v1)**

**Goal:** Provider-backed ASR + storable segments + failure path.

| Work item | Status |
|-----------|--------|
| Provider abstraction | `src/transcription/` — `stub` \| `assemblyai` via `TRANSCRIPTION_PROVIDER` |
| Env | `MEDIA_VAULT_PATH`, `TRANSCRIPTION_PROVIDER`, `ASSEMBLYAI_API_KEY` |
| Storage | Multipart `POST /api/episodes/:id/audio` → `MEDIA_VAULT_PATH/{episodeId}/original.*` + `audio_local_rel_path`; HTTPS `audio_url` still supported |
| Schema | `transcript_segments`; `episodes.audio_local_rel_path`, `processing_error`, `audio_mime_type`; enum `FAILED` |
| Worker | `handleTranscribeEpisode` loads bytes, runs `runTranscription`, replaces segments, `READY` or `FAILED` + `episode:failed` SSE |
| UI | Upload control, timed segments table, error banner, SSE refresh |

**Still later:** S3/R3 presign (replace local disk), idempotency keys for provider billing, webhook-based async ASR if needed.

**Exit criteria (met):** Upload or URL → transcript + segments in DB → UI table; AssemblyAI when configured, stub otherwise.

---

## Phase B — Launch campaign board (P0–P1) — **implemented (v1)**

**Goal:** One episode → checklist + statuses (draft → published → measured) without full social integrations.

| Work item | Details |
|-----------|---------|
| Schema | `campaigns` (one per episode, `campaign_status`, `utm_campaign`, dates), `campaign_tasks` (`task_type`, `label`, `done_at`, `sort_order`). Migration `0011_campaigns.sql`; `npm run db:apply-0011` if migrate fails. |
| API | `GET/PATCH /api/episodes/:episodeId/campaign`, task `POST/PATCH/DELETE`, `GET .../campaign/export`. |
| Jobs | Optional: `SEND_SCHEDULED_REMINDER` (later). |
| UI | `/episodes/:episodeId/launch` — checklist, status, UTM, export JSON; link from episode page. |
| SSE | `campaign:updated` to user. |

**Exit criteria (met):** User can mark launch tasks done, set campaign status / UTM, export bundle, and see live updates via SSE.

---

## Phase C — Attribution v0 (P1)

**Goal:** Directional proof: links + self-reported numbers, not perfect multi-touch.

| Work item | Details |
|-----------|---------|
| Schema | `tracking_links` (episode_id, campaign_id, platform, utm, short code), `analytics_events` or daily `snapshots` (episode_id, metric_key, value, source). |
| API | CRUD UTMs, `POST /analytics/snapshots` (manual), `GET /analytics/summary`. |
| UI | Dashboard charts (reuse chart patterns from legacy `Analytics.tsx` if present). |
| Jobs | `REFRESH_ANALYTICS` cron (placeholder or pull from APIs later). |

**Exit criteria:** Per-episode view: clicks + entered plays + optional subscriber note.

---

## Phase D — Sponsor report (P1) — **PDF v1 shipped**

**Goal:** PDF/export that reuses pdf-lib infrastructure, not dispute templates.

| Work item | Details |
|-----------|---------|
| Code | `src/pdf/sponsorPodsignalReport.ts` + `src/podsignal/buildReportSummary.ts` (shared JSON + PDF payload). |
| API | `GET /api/podsignal/report-summary` (JSON); `GET /api/podsignal/sponsor-report.pdf` (attachment; logs `sponsor_report_exported`). |
| UI | `/reports` — **Download PDF proof** + existing TXT export. |

**Exit criteria (met):** Downloadable PDF with executive summary, KPIs, clicks-by-episode, evidence layers.

---

## Phase E — Billing & entitlements (P1) — **workspace caps v1**

**Goal:** Episode/show limits aligned to plan; processing quota already uses `reviewLimit` / `reviewsUsed`.

| Work item | Details |
|-----------|---------|
| Caps | `src/billing/workspaceCaps.ts` — limits by `plan` (subscription `merchant_id` or `owner_user_id`). |
| Enforcement | `POST /api/podcasts` (show cap), `POST /api/episodes` (episode cap) — `403` + `SHOW_LIMIT_EXCEEDED` / `EPISODE_LIMIT_EXCEEDED`. |
| Stripe | Existing checkout/webhook continues to set `plan`; caps follow plan string. |

**Exit criteria (met):** Free/starter/pro/enterprise caps enforced on new shows and new episodes; upgrade path via Billing.

---

## Phase F — Quality & ops (P2)

- E2E: signup → show → episode → process → READY (Playwright).  
- Unit tests: transcription adapter, UTM builder, limit checks.  
- Observability: structured logs per job, dead-letter queue for failed jobs.  
- Rate limits on upload and process endpoints.

---

## Dependency graph (simplified)

```
Storage + ASR (Phase A)
    → Clip/hook scoring (future)
    → Sponsor mention detection (future)
Campaign board (Phase B) — can parallel early UI mock; full value after A
Attribution (Phase C) — parallel after B minimally (UTMs only)
Sponsor PDF (Phase D) — needs C for meaningful charts, or stub metrics first
Billing (Phase E) — can start after A (process costs money)
```

---

## Backlog (prioritized)

| Priority | Item |
|----------|------|
| P0 | Real transcription provider + segment storage |
| P0 | Upload/presign path for audio |
| P0 | Failed job state + user-visible error |
| P1 | Campaigns + tasks schema + API + UI |
| P1 | Attribution v0 (UTM + manual stats) |
| P1 | Sponsor PDF v1 |
| P1 | Billing limits by episode/show |
| P2 | Team roles, RSS ingest, YouTube OAuth |
| P2 | Weekly digest email, `SEND_WEEKLY_GROWTH_DIGEST` job |

---

## Open decisions (record answers as you go)

1. **Transcription vendor** — cost vs diarization vs EU data residency.  
2. **Video** — v1 audio-only vs video pipeline (larger scope).  
3. **Workspace** — keep `merchants` table name vs migrate to `workspaces` for clarity.  
4. **Dual mode** — ever run legacy + PodSignal in one deploy? (Currently: one or the other.)

---

## Revision history

| Date | Author | Notes |
|------|--------|-------|
| 2026-03-26 | Pivot | Initial roadmap from Phase 0 + stub worker state |
