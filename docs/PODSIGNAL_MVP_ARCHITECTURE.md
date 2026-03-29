# PodSignal MVP — architecture alignment (living doc)

This document records the **ruthless MVP** wedge, **measurement honesty** model, repo classification, and **implemented** foundations as of the latest alignment pass.

## A. Repo gap audit (summary)

| Area | Finding |
|------|---------|
| **Shipped routes** (`client/src/App.tsx`) | Already PodSignal-only: dashboard, shows, episodes, campaigns, billing, analytics, reports, settings, onboarding. **No** legacy ReviewerConsole/Admin/Analytics routes mounted. |
| **Legacy pages on disk** | `Dashboard.tsx`, `Analytics.tsx`, `Admin.tsx`, `ReviewerConsole.tsx`, etc. — **not mounted**. See `client/src/pages/legacy/README.md`. |
| **Server routes** (`src/server/index.ts`) | PodSignal APIs + billing + auth; **no** disputes/console/webhooks mounted here. Legacy route **files** may still exist under `src/server/routes/`. |
| **Schema** | Shared DB: `merchant_users`, `merchants`, `reviews_investigation` (legacy) **and** `podcasts`, `episodes`, `campaigns`, `clips`, … (PodSignal). |
| **Billing API fields** | Still named `reviewLimit` / `reviewsUsed` in JSON — **display** copy updated to “episode processing credits”; schema rename = later migration. |
| **Settings** | POS + Google webhook + review-flavored notifications — **labeled legacy** where not MVP. |

**Keep:** Auth, billing, podcasts/episodes/campaigns pipeline, transcription worker, SSE, Stripe, Postgres/Redis.  
**Repurpose:** Billing UI language toward episode credits; webhook tab as optional legacy.  
**Isolate:** Unmounted legacy React pages; non-mounted server routes.  
**Remove later:** After dependency proof — `reviews_investigation` consumers from any future PodSignal-only server entry (not in this pass).

## B. Ruthless MVP definition

- **MVP:** Turn **one episode** into a **7-day measurable launch campaign** — transcript/chapters, clip candidates, packaging outputs, checklist, trackable IDs, **directional** performance, **sponsor / launch report** export.  
- **Out of scope (now):** Native social publish, full multi-touch attribution, collaboration beyond minimal roles, AI thumbnails/voice, benchmarking at scale.  
- **Wedge:** Repeatable weekly loop + **honest** metrics + **one premium artifact** (sponsor one-pager / 7-day launch report).  
- **Premium artifact:** **Sponsor-ready one-pager / launch report** (UI: `SponsorReportsPlaceholder.tsx` — honest about illustrative vs observed data).

## C. Scientifically honest measurement (code)

| Layer | Meaning |
|-------|---------|
| `observed` | Clicks on PodSignal-tracked links, exports, checklist completions, uploads, generation status. |
| `proxy` | Windowed aggregates, before/after launch, relative title/clip performance. |
| `inferred` | Modeled lift, patterns across episodes — **language:** “estimated”, “likely associated”. |
| `unsupported` | Third-party platform metrics without an observed path — **do not** claim causality. |

**Implementation:** `src/podsignal/measurement.ts` — `CLAIM_VOCABULARY`, `FORBIDDEN_CAUSAL_CLAIMS`, `containsForbiddenCausalClaim`, `OUTPUT_USAGE_EVENT_TYPES`.  
**UI:** `client/src/components/MeasurementHonestyBanner.tsx` on Dashboard, Analytics, Sponsor Reports.

## D. MVP architecture (incremental)

| Piece | Location |
|-------|----------|
| **Domain types (doc contracts)** | `src/podsignal/domain.ts` |
| **Output usage persistence** | `podsignal_output_usage` table + `POST /api/podsignal/output-usage` |
| **Taxonomy API** | `GET /api/podsignal/measurement-taxonomy` |
| **Core entities (DB)** | `podcasts`, `episodes`, `signals`, `clips`, `campaigns`, `campaign_tasks`, … `src/db/schema.ts` |

Apply migration: `npm run db:apply-0012` (after Postgres up).

## E. Next 5–10 highest-leverage changes (not all done in one pass)

1. ~~Measurement primitives + usage table + API~~ (done).  
2. Wire `postPodsignalOutputUsage` from episode launch / title pick / export buttons.  
3. Replace Billing API field names in backend + DB (episode credits).  
4. Dashboard KPIs from real APIs + label each KPI with `evidence` level.  
5. Launch pack / packaging JSON model + approval state on `episodes` or new table.  
6. Trackable link generator + redirect hit logging → `observed`.  
7. PDF/one-pager export binding to real metrics.  
8. Feature-flag or remove legacy notification strings when SMTP templates are PodSignal-specific.

## F–H. See git commit / PR for file list, tests, risks.

**Risks:** Sample analytics still look “precise” in charts — mitigated by honesty banners + copy; legacy schema names in billing API; dual domain in one DB until a hard split or rename migration.
