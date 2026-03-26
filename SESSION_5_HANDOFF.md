# Session 5 Handoff — ReviewGuard AI Reviewer Console

**Completed:** 2026-03-25
**Status:** All completion criteria verified — typecheck zero errors (backend + frontend), client builds, routes live, acknowledgement flow working.

---

## 1. URL pattern

The Reviewer Console is accessible at: `/console/:investigationId`

---

## 2. Backend route paths

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/console/investigations/:investigationId` | Full investigation data for console |
| POST | `/api/console/investigations/:investigationId/confirm` | Merchant confirms review |
| GET | `/api/console/investigations/:investigationId/pdf-status` | Poll for PDF readiness |

---

## 3. POST /confirm behaviour

Request body:
```json
{
  "merchantUserId": "string",
  "acknowledgedSections": [1, 2, 3, 4, 5]
}
```

Validation:
- `acknowledgedSections` must be exactly `[1, 2, 3, 4, 5]` — 400 if not
- `matchStatus` must not be PENDING/PROCESSING — 409 if not scored
- `human_reviewed_at` must be null — 409 if already confirmed
- `consoleTier` must not be SUPPRESSED — 403 if score < 50

On success:
1. Sets `human_reviewed_at = NOW()` and `human_reviewer_id`
2. Appends `HUMAN_CONFIRMED` to `audit_log`
3. Enqueues `GENERATE_DISPUTE_PDF` job
4. Returns HTTP 200

---

## 4. consoleTier logic

| Tier | Condition |
|---|---|
| `NOT_READY` | matchStatus in [PENDING, PROCESSING] |
| `SUPPRESSED` | score < 50 OR matchStatus === 'NO_RECORD' |
| `ADVISORY` | score >= 50 AND score < 75 |
| `VERIFIED` | score >= 75 |

---

## 5. Static file serving

The React build in `client/dist/` is served by `@fastify/static` from the same Fastify process. SPA fallback is configured — all non-API GET requests return `index.html`.

---

## 6. How to trigger the full flow

```bash
# 1. Start the server
npm run dev

# 2. In another terminal, start the client dev server (optional, for HMR)
npm run client:dev

# 3. Navigate to the console
open http://localhost:5173/console/{investigation-id}

# 4. Walk through all 5 sections, check each acknowledgement
# 5. Click "Confirm & Export"
# 6. PDF is generated and download starts automatically
```

---

## 7. Deviations from spec

| Item | Spec | Actual | Reason |
|---|---|---|---|
| CSS framework | Plain CSS modules | Plain CSS modules | Matches spec exactly |
| Dark mode | Spec defines dark mode tokens | Tokens defined in CSS custom properties, basic dark mode via `prefers-color-scheme` | Full dark mode styling deferred to Session 6 polish |
| concurrently | Used for `client:dev` script | `concurrently` installed as devDependency but `client:dev` is a simple cd + npm run | Keeps it simple — user can run both terminals manually |
