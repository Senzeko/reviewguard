# PodSignal — 3-episode paid pilot runbook

Step-by-step guide for running a design-partner pilot with three episodes end to end. Assumes migration **0013** (launch pack, trackable links, output usage) is applied and the API is healthy (`GET /health` shows pilot schema ready).

## Before the pilot

1. Create or reuse a workspace account with a merchant record (so onboarding does not block the app shell).
2. Apply database migrations per your environment (`npm run db:apply-0013` or your deployment process).
3. Confirm **Sponsor Reports** loads without a schema error banner; if you see a 503 with `PODSIGNAL_PILOT_SCHEMA_MISSING`, fix migrations before inviting the partner.

## Episode 1 — establish the baseline

1. **Shows** → select (or create) the show → **New episode** (or open an existing draft).
2. **Episode detail**: set title and audio as needed → save → run **Process** if transcripts and launch copy depend on it.
3. Open **Launch** from the episode (or navigate to `/episodes/:id/launch`).
4. Select a title variant and any metadata drafts the partner cares about.
5. **Create trackable link** with a real destination URL (RSS, landing page, or host listen link).
6. **Mark approved** on the launch pack when the partner signs off.
7. Copy **guest share**, **newsletter**, or **social** blocks as appropriate; each copy is observed for the pilot report.
8. Optional: open the short link in a clean browser session once to generate an **observed** redirect (for the report KPI).

## Episode 2 — repeat with a second launch window

1. Repeat the same path on a second episode (new trackable links per channel if useful).
2. Encourage the partner to complete at least one **checklist** task in-app so proxy “ops follow-through” signals appear in the report.
3. Open **Sponsor Reports** → **Refresh numbers** after activity → **Export shareable proof (TXT)** when you want a frozen artifact for the sponsor.

## Episode 3 — close the loop with evidence

1. Run episode 3 through the same launch flow.
2. On **Sponsor Reports**, walk the partner through: executive summary → **what likely worked** (qualitative, not causal) → before/after narrative → KPIs and evidence layers.
3. Export TXT again if the window has moved or clicks/usage increased.
4. Agree on what is **observed** (PodSignal events + short-link redirects) vs **proxy** or **unsupported** so nobody over-claims listener or ad results.

## After the pilot

- Pull `output_usage` aggregates (or your analytics on `pilot_ui_nav`, page views, exports) to see which surfaces and outputs were used.
- File follow-ups for anything deferred (e.g. full analytics wiring, SSE recovery tests, real host metrics).

## Automated check

The reliability Playwright suite includes `pilot-launch-loop.spec.ts`, which mocks the API and asserts: approve pack → create link → visit `/r/:token` → refresh report → trackable clicks KPI increases.

Run: `npm run test:e2e:reliability`
