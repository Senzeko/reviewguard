# Session 1 Handoff — ReviewGuard AI Data Layer

> **Read this file before starting Sessions 2, 3, or 4.**
> It contains every import path, enum value, queue key, and deviation note you need.

**Completed:** 2026-03-25
**Status:** All completion criteria verified — typecheck (zero errors), migrations applied, seed data inserted, secrets round-trip test passed.

---

## 1. Import paths

All paths are relative to `reviewguard/src/`. All local imports use the `.js` extension (required by `moduleResolution: NodeNext`).

| What | Import |
|---|---|
| Typed `env` object (all validated env vars) | `import { env } from './env.js'` |
| Drizzle `db` instance | `import { db } from './db/index.js'` |
| Raw pg `pool` (shutdown only) | `import { pool } from './db/index.js'` |
| Close Postgres pool | `import { closeDb } from './db/index.js'` |
| All schema tables | `import { merchants, transactionsVault, reviewsInvestigation } from './db/schema.js'` |
| TypeScript types (select) | `import type { Merchant, Transaction, ReviewInvestigation } from './db/schema.js'` |
| TypeScript types (insert) | `import type { NewMerchant, NewTransaction, NewReviewInvestigation } from './db/schema.js'` |
| Enum constants | `import { posProviderEnum, matchStatusEnum } from './db/schema.js'` |
| Shared JSONB interfaces | `import type { LineItem, AuditLogEntry, FactorBreakdown } from './db/schema.js'` |
| Redis client | `import { redis } from './queue/client.js'` |
| Redis connect / close | `import { connectRedis, closeRedis } from './queue/client.js'` |
| Redis health check | `import { isRedisHealthy } from './queue/client.js'` |
| Job types enum | `import { JobType } from './queue/jobs.js'` |
| Job payload interfaces | `import type { ProcessNewReviewJob, SyncPosTransactionsJob, PurgeExpiredNamesJob, GenerateDisputePdfJob, ReviewGuardJob } from './queue/jobs.js'` |
| Queue name constants | `import { QUEUES } from './queue/jobs.js'` |
| Enqueue helper | `import { enqueue } from './queue/jobs.js'` |
| Dequeue (non-blocking) | `import { dequeue } from './queue/jobs.js'` |
| Dequeue (blocking, BRPOP) | `import { dequeueBlocking } from './queue/jobs.js'` |
| Encrypt / decrypt | `import { encrypt, decrypt } from './secrets/index.js'` |
| Name hashing | `import { hashName } from './secrets/index.js'` |
| Key validation | `import { validateEncryptionKey } from './secrets/index.js'` |

---

## 2. `JobType` enum values

```typescript
import { JobType } from './queue/jobs.js';

JobType.PROCESS_NEW_REVIEW     // 'PROCESS_NEW_REVIEW'
JobType.SYNC_POS_TRANSACTIONS  // 'SYNC_POS_TRANSACTIONS'
JobType.PURGE_EXPIRED_NAMES    // 'PURGE_EXPIRED_NAMES'
JobType.GENERATE_DISPUTE_PDF   // 'GENERATE_DISPUTE_PDF'
```

---

## 3. `QUEUES` constants (Redis list keys)

```typescript
import { QUEUES } from './queue/jobs.js';

QUEUES.REVIEWS    // 'rg:queue:reviews'       — ForensicMatchEngine (Session 3)
QUEUES.POS_SYNC   // 'rg:queue:pos_sync'      — POS sync worker (Session 2)
QUEUES.SCHEDULED  // 'rg:queue:scheduled'     — Cron/maintenance jobs
QUEUES.PDF        // 'rg:queue:pdf'           — Dispute PDF generator (Session 4)
```

The `enqueue`/`dequeue` helpers take `keyof typeof QUEUES` (`'REVIEWS' | 'POS_SYNC' | 'SCHEDULED' | 'PDF'`), not the raw string key.

---

## 4. Database schema — column names

Drizzle maps TypeScript camelCase field names to SQL snake_case column names automatically.

### `merchants`
| TS field | SQL column | Notes |
|---|---|---|
| `id` | `id` | UUID PK, `gen_random_uuid()` |
| `googlePlaceId` | `google_place_id` | UNIQUE, used as name-hash salt |
| `businessName` | `business_name` | |
| `posProvider` | `pos_provider` | Enum: `'SQUARE' \| 'CLOVER'` |
| `posApiKeyEnc` | `pos_api_key_enc` | AES-256-GCM ciphertext (hex) |
| `posApiKeyIv` | `pos_api_key_iv` | 12-byte IV (hex) |
| `posApiKeyTag` | `pos_api_key_tag` | 16-byte GCM auth tag (hex) |
| `webhookSecret` | `webhook_secret` | Google webhook HMAC secret |
| `isActive` | `is_active` | Soft-delete flag |
| `createdAt` | `created_at` | |
| `updatedAt` | `updated_at` | |

### `transactions_vault`
| TS field | SQL column | Notes |
|---|---|---|
| `id` | `id` | UUID PK |
| `merchantId` | `merchant_id` | FK → merchants.id CASCADE |
| `posTransactionId` | `pos_transaction_id` | Original POS ID |
| `nameHash` | `name_hash` | Salted SHA-256 (permanent) |
| `namePlainTemp` | `name_plain_temp` | Nullable, purged after 14 days |
| `namePlainExpiresAt` | `name_plain_expires_at` | Nullable timestamptz |
| `lineItems` | `line_items` | JSONB: `LineItem[]` |
| `transactionAmountCents` | `transaction_amount_cents` | Integer cents |
| `closedAt` | `closed_at` | UTC close time (indexed) |
| `posProvider` | `pos_provider` | Enum: `'SQUARE' \| 'CLOVER'` |
| `rawPayloadEnc` | `raw_payload_enc` | Nullable, AES-encrypted audit copy |
| `createdAt` | `created_at` | |

Composite UNIQUE on `(merchant_id, pos_transaction_id)`.

### `reviews_investigation`
| TS field | SQL column | Notes |
|---|---|---|
| `id` | `id` | UUID PK |
| `merchantId` | `merchant_id` | FK → merchants.id CASCADE (indexed) |
| `googleReviewId` | `google_review_id` | UNIQUE |
| `reviewerDisplayName` | `reviewer_display_name` | Jaro-Winkler input |
| `reviewText` | `review_text` | LLM input (Session 3) |
| `reviewRating` | `review_rating` | Integer 1–5 |
| `reviewPublishedAt` | `review_published_at` | UTC (indexed) |
| `matchedTransactionId` | `matched_transaction_id` | Nullable FK → transactions_vault.id |
| `confidenceScore` | `confidence_score` | Nullable 0–100 |
| `matchStatus` | `match_status` | Enum, indexed, default `'PENDING'` |
| `llmInferenceFlag` | `llm_inference_flag` | Boolean |
| `factorBreakdown` | `factor_breakdown` | Nullable JSONB: `FactorBreakdown` |
| `humanReviewedAt` | `human_reviewed_at` | Nullable timestamptz |
| `humanReviewerId` | `human_reviewer_id` | Nullable text |
| `auditLog` | `audit_log` | JSONB array: `AuditLogEntry[]`, default `[]` |
| `disputeExportedAt` | `dispute_exported_at` | Nullable timestamptz |
| `createdAt` | `created_at` | |
| `updatedAt` | `updated_at` | |

---

## 5. Secrets service usage

```typescript
import { encrypt, decrypt, hashName, validateEncryptionKey } from './secrets/index.js';

// Encrypt a POS token before writing to DB
const blob = encrypt('sq_live_abc123');
// blob = { ciphertext: '...hex...', iv: '...hex...', tag: '...hex...' }

// Store blob.ciphertext → merchants.pos_api_key_enc
//       blob.iv         → merchants.pos_api_key_iv
//       blob.tag        → merchants.pos_api_key_tag

// Decrypt at runtime
const token = decrypt({ ciphertext, iv, tag });

// Hash a customer name for DB storage
const hash = hashName('John Smith', merchant.googlePlaceId);
// store → transactions_vault.name_hash
```

> `validateEncryptionKey()` throws if `process.env.ENCRYPTION_KEY` is not exactly 64 hex chars. Call it at startup before any encrypt/decrypt operations.

---

## 6. Migrations

Two migration files live in `./migrations/`:

| File | Contents |
|---|---|
| `0000_initial_schema.sql` | Creates all three tables, enums, indexes, FKs |
| `0001_purge_name_plain_temp.sql` | Creates `purge_expired_name_plain_temp()` PL/pgSQL function |

The `migrations/meta/` directory contains the drizzle-kit journal and snapshot required for `drizzle-kit migrate` and `drizzle-kit generate` to work correctly.

**Fresh environment migration steps:**
```bash
# 1. Create the database
createdb reviewguard

# 2. Set env var
export DATABASE_URL="postgresql://user:password@localhost:5432/reviewguard"

# 3. Apply all migrations
npm run db:migrate

# 4. Seed dev data (optional)
NODE_ENV=development npm run db:seed
```

---

## 7. Deviations from spec

| Item | Spec | Actual | Reason |
|---|---|---|---|
| `dotenv` added | Not in spec | `dotenv` added as dependency | Required to load `.env` file into `process.env`. Added `import { config } from 'dotenv'; config();` at top of `src/env.ts` and `drizzle.config.ts` |
| `secrets/index.ts` imports | Spec showed importing env.ts | Does NOT import env.ts | Avoids circular dependency when running the self-test directly; zod already validates ENCRYPTION_KEY in env.ts |
| `dequeueBlocking()` | Not in spec | Added as bonus export | Worker loops in Sessions 2/3 need BRPOP; non-blocking `dequeue()` specified in spec is still the primary export |
| `src/env.ts` validates `ENCRYPTION_KEY` | Spec: validate in secrets service | Validated in both places | Belt-and-suspenders: zod catches missing/wrong-format key at startup, secrets service validates at runtime |

---

## 8. npm scripts

```bash
npm run dev              # tsx watch src/index.ts
npm run build            # tsc (output → dist/)
npm run typecheck        # tsc --noEmit
npm run db:generate      # drizzle-kit generate  (regenerates migrations/)
npm run db:migrate       # drizzle-kit migrate   (applies pending migrations)
npm run db:studio        # drizzle-kit studio    (browser schema explorer)
npm run db:seed          # tsx src/db/seed.ts    (dev only)
npm run db:purge-names   # calls purge_expired_name_plain_temp() directly
npm run queue:flush      # flushes all Redis queues (dev only)
```

---

## 9. Session 2 checklist

Before Session 2 starts:

- [ ] `npm install` completed successfully
- [ ] `.env` created from `.env.example` with all values filled
- [ ] `npm run typecheck` — zero errors
- [ ] `npm run db:migrate` — both migrations applied
- [ ] `npm run db:seed` — fixture data inserted
- [ ] Postgres reachable at `DATABASE_URL`
- [ ] Redis reachable at `REDIS_URL`
- [ ] `node -e "import('./src/secrets/index.js')"` self-test passes (or `npx tsx src/secrets/index.ts`)
