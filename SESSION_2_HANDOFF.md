# Session 2 Handoff — ReviewGuard AI Ingress Gateway

**Completed:** 2026-03-25
**Status:** All completion criteria verified — typecheck zero errors, health endpoint 200, webhook accept + idempotency, merchant creation, engine scoring.

---

## 1. HTTP Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | System health check — DB + Redis status |
| POST | `/webhooks/google-review` | Google Review webhook handler (HMAC-verified) |
| GET | `/oauth/square/start?merchantId=` | Redirects to Square OAuth authorization |
| GET | `/oauth/square/callback?code=&state=` | Square OAuth token exchange |
| GET | `/oauth/clover/start?merchantId=` | Redirects to Clover OAuth authorization |
| GET | `/oauth/clover/callback?code=&state=&merchant_id=` | Clover OAuth token exchange |
| POST | `/merchants` | Create a new merchant |
| GET | `/merchants/:id/status` | Merchant connection status |
| POST | `/internal/engine/test-match` | Dev-only: run engine on a review without writing results (Session 6) |

---

## 2. Import paths for POS sync functions

```typescript
import { syncSquareTransactions } from './pos/square.js';
import { syncCloverTransactions } from './pos/clover.js';
```

Both return `Promise<number>` (count of inserted rows).

---

## 3. Queue confirmation

`PROCESS_NEW_REVIEW` jobs are flowing into `rg:queue:reviews` (verified via webhook test).

The webhook handler at `POST /webhooks/google-review`:
1. Verifies HMAC-SHA256 signature against merchant's `webhook_secret`
2. Checks idempotency via `google_review_id` UNIQUE constraint
3. Inserts into `reviews_investigation` with `match_status = 'PENDING'`
4. Calls `enqueue('REVIEWS', { type: JobType.PROCESS_NEW_REVIEW, ... })`
5. Returns `{ "status": "accepted" }` on success

---

## 4. Audit log entries written by the Session 2 worker

### WEBHOOK_RECEIVED (written at webhook ingestion time)
```json
{
  "event": "WEBHOOK_RECEIVED",
  "actor": "ingress",
  "ts": "2026-03-25T...",
  "detail": "Review from Sarah K. (rating: 5)"
}
```

### REVIEW_QUEUED (written by the processReview handler)
```json
{
  "event": "REVIEW_QUEUED",
  "actor": "worker",
  "ts": "2026-03-25T...",
  "detail": "Candidate transactions found: 3"
}
```

---

## 5. Schema changes from Session 1

- Added `PROCESSING` to `match_status` enum (migration `0002_lucky_terrax.sql`)
- Added `clover_merchant_id TEXT` to `merchants` table
- Added `last_sync_at TIMESTAMPTZ` to `merchants` table

---

## 6. Deviations from spec

| Item | Spec | Actual | Reason |
|---|---|---|---|
| Fastify JSON parser | Default Fastify JSON parser | Custom `application/json` content type parser | Required to capture raw body string for HMAC verification before Fastify parses JSON |
| `dotenv` override | Not specified | `config({ override: true })` | User's shell had `ANTHROPIC_API_KEY=""` set, causing .env values to be ignored; override ensures .env wins in dev |
| Engine test endpoint | Specified in Session 3 spec | Implemented in Session 2 alongside server routes | Route registration belongs in the server module |

---

## 7. Worker and scheduler

- **Job queue worker** (`src/worker/index.ts`): polls all 4 queues every 500ms in round-robin
- **Engine worker** (`src/engine/worker.ts`): polls `reviews_investigation` every 1000ms for PENDING rows
- **Scheduler** (`src/scheduler/index.ts`): POS sync every 6h, name purge every 1h

All three are started from `src/index.ts` and stopped on SIGTERM/SIGINT.
