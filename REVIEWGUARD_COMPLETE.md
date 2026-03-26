# ReviewGuard AI — Build Complete

## System summary

ReviewGuard AI is a forensic reputation management system that helps restaurants, nail salons, auto shops, and retail merchants identify and dispute fabricated Google reviews. It ingests review webhooks from Google, matches them against POS transaction records using a three-factor scoring engine (Jaro-Winkler identity matching, temporal decay analysis, and LLM-assisted line-item extraction), and produces court-ready PDF evidence packets — all with mandatory human oversight at every stage to comply with 2026 ADMT regulations.

## Sessions completed

| Session | Description                    | Status |
|---------|--------------------------------|--------|
| S1      | Database & infrastructure      | ✓      |
| S2      | Ingress gateway                | ✓      |
| S3      | ForensicMatchEngine            | ✓      |
| S4      | Evidence vault & PDF           | ✓      |
| S5      | Reviewer Console               | ✓      |
| S6      | Integration, compliance, deploy| ✓      |

## Test results

- Unit tests (vitest):         23 passing, 0 failing
- E2E tests (Playwright):      3 spec files (fullFlow, webhookIngress, scoreRouting)
- ADMT compliance tests:       4 spec files (noAutoDispute, ackEnforcement, auditLog, suppressedGuard)
- False-positive rate dataset:  50 ground-truth cases (25 genuine, 25 fake)
- Engine load test:             autocannon against /internal/engine/test-match
- Backend typecheck:            zero errors
- Client typecheck:             zero errors

## ADMT compliance attestation

ReviewGuard AI satisfies the 2026 ADMT meaningful human oversight requirement via:

1. **No automated dispute filing** — all disputes require explicit merchant confirmation via POST /api/console/investigations/:id/confirm. The POST /disputes/:id/export route returns HTTP 403 if human_reviewed_at is null.

2. **Section-by-section acknowledgement enforcement** — the UI requires checking all 5 evidence sections before the Confirm button enables. The API validates that acknowledgedSections is exactly [1, 2, 3, 4, 5] and returns HTTP 400 otherwise. Checkboxes are one-way (cannot be unchecked once acknowledged).

3. **Server-side consoleTier routing** — suppressed cases (score < 50 or NO_RECORD) cannot be disputed even via direct API calls. The confirm endpoint returns HTTP 403 for suppressed reviews. The console UI redirects to a Suppressed component with no export functionality.

4. **Immutable audit_log** — every stage is timestamped and actor-attributed in a JSONB append-only array: WEBHOOK_RECEIVED (ingress), REVIEW_QUEUED (worker), ENGINE_SCORED (forensic_engine), HUMAN_CONFIRMED (merchantUserId), PDF_GENERATED (system). Events are verified to be in chronological order.

5. **AI inference labeling** — when the ForensicMatchEngine uses LLM extraction for line-item matching, llm_inference_flag is set to true. This surfaces in the Reviewer Console as a non-dismissible amber AiWarningBanner ("AI inference active"), and in the PDF evidence packet as explicit "AI-Assisted Inference" labels on line-item findings.

## Production deployment

```bash
# 1. Clone and setup
git clone <repo> && cd reviewguard
cp .env.example .env
# Fill in all required values in .env

# 2. Pre-flight check (requires running server)
npm run preflight

# 3. Docker deployment
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# 4. Apply migrations
docker-compose -f docker-compose.prod.yml exec app npx drizzle-kit migrate

# 5. Verify
curl http://localhost:3000/health
```

### Environment variables required

| Variable | Description |
|---|---|
| DATABASE_URL | PostgreSQL connection string |
| REDIS_URL | Redis connection string |
| ENCRYPTION_KEY | 64 hex chars (32 bytes) for AES-256-GCM |
| ANTHROPIC_API_KEY | Anthropic API key for LLM extraction |
| GOOGLE_PLACES_API_KEY | Google Places API key |
| SQUARE_APPLICATION_ID | Square OAuth app ID |
| SQUARE_APPLICATION_SECRET | Square OAuth app secret |
| CLOVER_APP_ID | Clover OAuth app ID |
| CLOVER_APP_SECRET | Clover OAuth app secret |
| EVIDENCE_VAULT_PATH | Path to PDF storage directory |

## Test commands

```bash
npm run test:unit      # Vitest unit tests (23 tests)
npm run test:e2e       # Playwright E2E tests
npm run test:admt      # ADMT compliance tests
npm run test:fpr       # False-positive rate measurement (50 cases)
npm run test:load      # Engine load test (autocannon)
npm run test:all       # Unit + E2E combined
npm run preflight      # Pre-deployment checklist
npm run typecheck      # Backend typecheck
```

## Known limitations

- Evidence vault uses local filesystem — migrate to S3 for multi-instance deployments
- No authentication layer — add JWT/session auth before exposing to real merchants
- POS sync is pull-based (scheduled) — upgrade to real-time webhooks for Square/Clover when available
- LLM extraction uses claude-sonnet-4-6 synchronously — use Batch API for high-volume deployments
- Dark mode styling deferred — CSS custom property tokens are defined but full dark mode is not implemented
- No dead-letter queue — failed jobs are logged but not automatically retried
