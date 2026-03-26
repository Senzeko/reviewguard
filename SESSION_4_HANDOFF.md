# Session 4 Handoff — ReviewGuard AI Dispute PDF Generation

**Completed:** 2026-03-25
**Status:** All completion criteria verified — typecheck zero errors, PDF generation wired, ADMT guard active, disputes routes live.

---

## 1. Route paths

| Method | Path | Purpose |
|---|---|---|
| POST | `/disputes/:investigationId/export` | Trigger PDF generation (ADMT guarded) |
| GET | `/disputes/:investigationId/pdf` | Download generated PDF |

---

## 2. ADMT guard

The POST `/disputes/:id/export` route returns **HTTP 403** if `human_reviewed_at` is null. This is the system-level ADMT guard — PDFs cannot be generated before the merchant explicitly confirms via the Reviewer Console.

On confirmation:
1. `human_reviewed_at` is set
2. `GENERATE_DISPUTE_PDF` job is enqueued
3. Worker calls `generateDisputePacket()` and stores via `storePdf()`

---

## 3. GENERATE_DISPUTE_PDF job

```typescript
{
  type: JobType.GENERATE_DISPUTE_PDF,
  investigationId: string,
  merchantId: string,
}
```

Enqueued to the `PDF` queue (`rg:queue:pdf`). Handler is idempotent — skips if PDF already exists.

---

## 4. Schema additions (migration 0003)

Added to `reviews_investigation`:
- `pdf_path TEXT` — relative path from vault root
- `pdf_generated_at TIMESTAMPTZ` — when PDF was generated
- `case_id TEXT` — case ID (format: `RG-YYYYMMDD-XXXX`)

---

## 5. Evidence Vault

PDFs stored at: `{EVIDENCE_VAULT_PATH}/{merchantId}/{caseId}.pdf`

`EVIDENCE_VAULT_PATH` defaults to `./evidence_vault` (configurable in `.env`).

---

## 6. Import paths

```typescript
import { generateDisputePacket, assembleEvidencePacket, generateCaseId } from './pdf/index.js';
import type { EvidencePacket } from './pdf/index.js';
import { storePdf, retrievePdf, pdfExists } from './pdf/vault.js';
```

---

## 7. Deviations from spec

| Item | Spec | Actual | Reason |
|---|---|---|---|
| pdf-lib type import | Spec uses `ReturnType<typeof rgb>` for Color | Uses `Color` type from pdf-lib | Cleaner type import |
| Evidence Vault storage | Spec mentions S3 for production | Local filesystem only | Session 6 can add S3; MVP uses local fs |
