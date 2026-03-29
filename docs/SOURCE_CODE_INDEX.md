# PodSignal — source code reference document

This document indexes the **PodSignal / ReviewGuard** application source. The active codebase lives in the git repository:

**`/Users/SIGNO/Desktop/ReviewGuard/reviewguard`**

The `PodSignal` folder on your Desktop holds product notes, RTFs, and this file; it is not the full app tree by itself.

---

## 1. How to get “everything” in one bundle

From the repo root:

```bash
cd /Users/SIGNO/Desktop/ReviewGuard/reviewguard
git archive --format=zip -o ../podsignal-source.zip HEAD
```

Or zip excluding heavy/secret paths:

```bash
cd /Users/SIGNO/Desktop/ReviewGuard/reviewguard
zip -r ../podsignal-source-slim.zip . \
  -x "node_modules/*" -x "client/node_modules/*" -x "dist/*" -x "client/dist/*" \
  -x ".git/*" -x "evidence_vault/*" -x "media_vault/*" -x "playwright-results/*"
```

Do **not** commit `.env`; copy `.env.example` and document secrets separately if needed.

---

## 2. Entry points

| Layer | Path | Role |
|--------|------|------|
| **API / worker** | `src/index.ts` | Boots Postgres, Redis, HTTP server, PodSignal worker |
| **HTTP server** | `src/server/index.ts` | Fastify: routes, static SPA, CORS, cookies |
| **React app** | `client/src/main.tsx` | Vite + React mount |
| **Router** | `client/src/App.tsx` | Routes: login, signup, dashboard, shows, episodes, campaigns, billing, etc. |

---

## 3. Top-level layout (repository)

| Path | Contents |
|------|-----------|
| `src/` | TypeScript backend: auth, DB, routes, workers, transcription, billing |
| `client/` | Vite + React SPA |
| `migrations/` | SQL migrations (Drizzle) |
| `tests/` | Vitest unit tests, Playwright e2e |
| `scripts/` | One-off migration / email scripts |
| `docs/` | Internal docs, Figma exports |
| `package.json` | Root scripts: `dev`, `dev:all`, `build`, `db:migrate`, tests |
| `client/vite.config.ts` | Dev proxy `/api` → `localhost:3000` |
| `drizzle.config.ts` | Database tooling |
| `docker-compose.yml` | Local Postgres + Redis |

---

## 4. Backend (`src/`) — modules

| Area | Paths |
|------|--------|
| **Auth** | `src/auth/` — session (Postgres), password hash, middleware, `authUserPayload` |
| **API routes** | `src/server/routes/` — `auth`, `episodes`, `podcasts`, `campaigns`, `billing`, `onboarding`, `analytics`, `sse`, `health`, … |
| **DB** | `src/db/schema.ts`, `src/db/index.ts`, `src/db/seed.ts` |
| **Queue / jobs** | `src/queue/`, `src/worker/` — transcription, PDF, POS sync, PodSignal worker |
| **Transcription** | `src/transcription/`, `src/worker/handlers/transcribeEpisode.ts` |
| **Media** | `src/media/resolveEpisodeAudio.ts` |
| **Billing** | `src/billing/`, `src/server/routes/billing.ts` |
| **Legacy ReviewGuard** | Engine (`src/engine/`), PDF (`src/pdf/`), disputes/webhooks, Google poller — coexists with PodSignal features |

---

## 5. Frontend (`client/src/`) — modules

| Area | Paths |
|------|--------|
| **App shell** | `App.tsx`, `components/PodSignalLayout.tsx`, `ProtectedRoute`, `AuthContext` |
| **PodSignal pages** | `DashboardPage`, `ShowsPage`, `ShowDetailPage`, `EpisodesListPage`, `EpisodeDetailPage`, `LaunchCampaignsPage`, `EpisodeLaunchPage`, `PodSignalAnalytics`, `SponsorReportsPlaceholder`, `Billing`, `Onboarding`, `Settings` |
| **Auth** | `Login.tsx`, `Signup.tsx`, `ForgotPassword`, `ResetPassword` |
| **API client** | `client/src/api/client.ts`, `httpPolicy.ts`, `userFacingError.ts` |
| **Legacy console UI** | `ReviewerConsole`, `Analytics`, dispute/evidence components — still in tree |

---

## 6. Complete inventory — TypeScript / TSX / CSS / HTML (149 files)

*Generated from `src/` and `client/src/` — excludes `node_modules` and build output.*

### Client (`client/src/`)

- `client/src/App.css`
- `client/src/App.tsx`
- `client/src/api/client.ts`
- `client/src/api/httpPolicy.test.ts`
- `client/src/api/httpPolicy.ts`
- `client/src/api/userFacingError.test.ts`
- `client/src/api/userFacingError.ts`
- `client/src/auth/authNavigation.test.ts`
- `client/src/auth/authNavigation.ts`
- `client/src/components/AdvisoryBanner.tsx`
- `client/src/components/AiWarningBanner.tsx`
- `client/src/components/AuthNavigationRegistrar.tsx`
- `client/src/components/AuthPodSignal.css`
- `client/src/components/AuthPodSignalBrand.tsx`
- `client/src/components/Banners.module.css`
- `client/src/components/ConfirmExportBar.module.css`
- `client/src/components/ConfirmExportBar.tsx`
- `client/src/components/EvidenceSection.module.css`
- `client/src/components/EvidenceSection.tsx`
- `client/src/components/HomeRedirect.tsx`
- `client/src/components/PodSignalLayout.css`
- `client/src/components/PodSignalLayout.tsx`
- `client/src/components/ProtectedRoute.tsx`
- `client/src/components/ScoreHeader.module.css`
- `client/src/components/ScoreHeader.tsx`
- `client/src/components/sections/DiscrepancyLog.tsx`
- `client/src/components/sections/ForensicFindings.tsx`
- `client/src/components/sections/IncidentOverview.tsx`
- `client/src/components/sections/MerchantStatement.tsx`
- `client/src/components/sections/Sections.module.css`
- `client/src/components/sections/TimestampAudit.tsx`
- `client/src/context/AuthContext.tsx`
- `client/src/hooks/useAcknowledgement.ts`
- `client/src/hooks/useEpisodeLiveUpdates.ts`
- `client/src/hooks/useInvestigation.ts`
- `client/src/hooks/useSseConnection.ts`
- `client/src/index.css`
- `client/src/lib/draftStorage.ts`
- `client/src/lib/sseBackoff.test.ts`
- `client/src/lib/sseBackoff.ts`
- `client/src/main.tsx`
- `client/src/pages/Admin.tsx`
- `client/src/pages/Analytics.tsx`
- `client/src/pages/Billing.tsx`
- `client/src/pages/Dashboard.tsx`
- `client/src/pages/DashboardPage.tsx`
- `client/src/pages/EpisodeDetailPage.tsx`
- `client/src/pages/EpisodeLaunchPage.tsx`
- `client/src/pages/EpisodesListPage.tsx`
- `client/src/pages/ForgotPassword.tsx`
- `client/src/pages/LaunchCampaignsPage.tsx`
- `client/src/pages/Legitimate.tsx`
- `client/src/pages/Locations.tsx`
- `client/src/pages/Login.css`
- `client/src/pages/Login.tsx`
- `client/src/pages/NotFound.tsx`
- `client/src/pages/Onboarding.tsx`
- `client/src/pages/PodSignalAnalytics.css`
- `client/src/pages/PodSignalAnalytics.tsx`
- `client/src/pages/ResetPassword.tsx`
- `client/src/pages/ReviewerConsole.tsx`
- `client/src/pages/Settings.tsx`
- `client/src/pages/SettingsPodSignal.css`
- `client/src/pages/ShowDetailPage.tsx`
- `client/src/pages/ShowsPage.css`
- `client/src/pages/ShowsPage.tsx`
- `client/src/pages/Signup.tsx`
- `client/src/pages/SponsorReportsPlaceholder.tsx`
- `client/src/pages/Suppressed.tsx`
- `client/src/pages/billingCheckoutLock.test.ts`
- `client/src/pages/podsignal-pages.css`
- `client/src/styles/tokens.css`
- `client/src/types/auth.ts`
- `client/src/types/investigation.ts`
- `client/src/types/podsignal.ts`

### Server (`src/`)

- `src/__tests__/identity.test.ts`
- `src/__tests__/lineItem.test.ts`
- `src/__tests__/temporal.test.ts`
- `src/auth/authUserPayload.test.ts`
- `src/auth/authUserPayload.ts`
- `src/auth/middleware.ts`
- `src/auth/password.ts`
- `src/auth/session.ts`
- `src/billing/enforcement.ts`
- `src/db/index.ts`
- `src/db/schema.ts`
- `src/db/seed.ts`
- `src/email/digest.ts`
- `src/email/notify.ts`
- `src/email/service.ts`
- `src/engine/factors/identity.ts`
- `src/engine/factors/lineItem.ts`
- `src/engine/factors/temporal.ts`
- `src/engine/index.ts`
- `src/engine/types.ts`
- `src/engine/worker.ts`
- `src/env.ts`
- `src/index.ts`
- `src/lib/episodeConcurrency.test.ts`
- `src/lib/episodeConcurrency.ts`
- `src/media/resolveEpisodeAudio.ts`
- `src/pdf/index.ts`
- `src/pdf/layout.ts`
- `src/pdf/sections/coverPage.ts`
- `src/pdf/sections/discrepancyLog.ts`
- `src/pdf/sections/forensicFindings.ts`
- `src/pdf/sections/incidentOverview.ts`
- `src/pdf/sections/merchantStatement.ts`
- `src/pdf/sections/timestampAudit.ts`
- `src/pdf/vault.ts`
- `src/poller/googleReviews.ts`
- `src/pos/clover.ts`
- `src/pos/normalizer.ts`
- `src/pos/square.ts`
- `src/queue/client.ts`
- `src/queue/jobs.ts`
- `src/scheduler/index.ts`
- `src/secrets/index.ts`
- `src/server/index.ts`
- `src/server/routes/admin.ts`
- `src/server/routes/analytics.ts`
- `src/server/routes/auth.ts`
- `src/server/routes/billing.ts`
- `src/server/routes/campaigns.ts`
- `src/server/routes/console.ts`
- `src/server/routes/dashboard.ts`
- `src/server/routes/disputes.ts`
- `src/server/routes/episodes.ts`
- `src/server/routes/health.ts`
- `src/server/routes/internal.ts`
- `src/server/routes/locations.ts`
- `src/server/routes/merchants.ts`
- `src/server/routes/oauth.ts`
- `src/server/routes/onboarding.ts`
- `src/server/routes/podcasts.ts`
- `src/server/routes/settings.ts`
- `src/server/routes/sse.ts`
- `src/server/routes/webhooks.ts`
- `src/transcription/assemblyai.ts`
- `src/transcription/index.ts`
- `src/transcription/stub.ts`
- `src/transcription/types.ts`
- `src/worker/handlers/generatePdf.ts`
- `src/worker/handlers/processReview.ts`
- `src/worker/handlers/purgeNames.ts`
- `src/worker/handlers/syncPos.ts`
- `src/worker/handlers/transcribeEpisode.ts`
- `src/worker/index.ts`
- `src/worker/podsignalWorker.ts`

### Client root (not under `src/`)

- `client/index.html`
- `client/vite.config.ts`
- `client/tsconfig.json` / `client/tsconfig.app.json` (if present)

---

## 7. Related config & SQL (not all listed above)

- Root: `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `playwright.reliability.config.ts`, `drizzle.config.ts`, `Dockerfile`, `docker-compose.yml`
- `migrations/*.sql` — database evolution

---

## 8. Note on verbatim “paste all code”

A single document containing **full file contents** for every source file would be **very large** (hundreds of thousands of lines) and duplicate what Git already stores. This file gives a **navigable map**; use **`git clone`**, **`git archive`**, or the zip commands in section 1 for a **complete** offline copy.

---

*Document generated for the PodSignal / ReviewGuard project. Update the file list if you add modules (`find src client/src -type f …`).*
