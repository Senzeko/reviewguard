/**
 * src/db/schema.ts
 *
 * Drizzle ORM table definitions — single source of truth for the database schema.
 * Sessions 2, 3, and 4 import types and table references directly from this file.
 *
 * Tables:
 *   1. merchants              — registered merchant accounts with encrypted POS creds
 *   2. transactions_vault     — POS transaction records with privacy-preserving name hashing
 *   3. reviews_investigation  — Google review forensic analysis records
 */
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
// ── Enums ─────────────────────────────────────────────────────────────────────
export const posProviderEnum = pgEnum('pos_provider', ['SQUARE', 'CLOVER']);
export const matchStatusEnum = pgEnum('match_status', [
    'VERIFIED',
    'MISMATCH',
    'NO_RECORD',
    'PENDING',
    'PROCESSING',
]);
// ── Table: merchants ──────────────────────────────────────────────────────────
export const merchants = pgTable('merchants', {
    /** Internal UUID primary key */
    id: uuid('id')
        .primaryKey()
        .default(sql `gen_random_uuid()`),
    /** Google Places identifier — drives review lookup and name-hash salting */
    googlePlaceId: text('google_place_id').notNull().unique(),
    /** Human-readable business name */
    businessName: text('business_name').notNull(),
    /** Which POS system this merchant uses */
    posProvider: posProviderEnum('pos_provider').notNull(),
    /**
     * AES-256-GCM ciphertext of the POS API credential (hex-encoded).
     * Decrypted at runtime by src/secrets/index.ts using ENCRYPTION_KEY.
     */
    posApiKeyEnc: text('pos_api_key_enc').notNull(),
    /** 12-byte GCM initialisation vector, hex-encoded. One per encrypt() call. */
    posApiKeyIv: text('pos_api_key_iv').notNull(),
    /** 16-byte GCM authentication tag, hex-encoded. Used to verify integrity on decrypt. */
    posApiKeyTag: text('pos_api_key_tag').notNull(),
    /** HMAC secret sent with Google webhook payloads for request verification */
    webhookSecret: text('webhook_secret').notNull(),
    /** Soft-delete flag — inactive merchants are excluded from engine runs */
    isActive: boolean('is_active').notNull().default(true),
    /** Clover's internal merchant identifier — set during Clover OAuth callback */
    cloverMerchantId: text('clover_merchant_id'),
    /** Last successful POS transaction sync timestamp */
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
        .notNull()
        .default(sql `now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .notNull()
        .default(sql `now()`),
});
// ── Table: merchant_users ────────────────────────────────────────────────────
export const merchantUsers = pgTable('merchant_users', {
    id: uuid('id')
        .primaryKey()
        .default(sql `gen_random_uuid()`),
    /** NULL during onboarding — set when merchant row is created in finalize step */
    merchantId: uuid('merchant_id').references(() => merchants.id, { onDelete: 'cascade' }),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    fullName: text('full_name').notNull(),
    /** 'owner' | 'staff' */
    role: text('role').notNull().default('owner'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
        .notNull()
        .default(sql `now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .notNull()
        .default(sql `now()`),
});
// ── Table: sessions ──────────────────────────────────────────────────────────
export const sessions = pgTable('sessions', {
    id: uuid('id')
        .primaryKey()
        .default(sql `gen_random_uuid()`),
    userId: uuid('user_id')
        .notNull()
        .references(() => merchantUsers.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
        .notNull()
        .default(sql `now()`),
}, (table) => [
    index('idx_sessions_token').on(table.token),
    index('idx_sessions_expires_at').on(table.expiresAt),
]);
// ── Table: onboarding_state ──────────────────────────────────────────────────
export const onboardingState = pgTable('onboarding_state', {
    id: uuid('id')
        .primaryKey()
        .default(sql `gen_random_uuid()`),
    userId: uuid('user_id')
        .notNull()
        .references(() => merchantUsers.id, { onDelete: 'cascade' })
        .unique(),
    /** 1=business, 2=pos, 3=google, 4=review & confirm */
    currentStep: integer('current_step').notNull().default(1),
    businessName: text('business_name'),
    posProvider: text('pos_provider'),
    posApiKey: text('pos_api_key'),
    googlePlaceId: text('google_place_id'),
    cloverMerchantId: text('clover_merchant_id'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
        .notNull()
        .default(sql `now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .notNull()
        .default(sql `now()`),
});
// ── Table: transactions_vault ─────────────────────────────────────────────────
export const transactionsVault = pgTable('transactions_vault', {
    /** Internal UUID primary key */
    id: uuid('id')
        .primaryKey()
        .default(sql `gen_random_uuid()`),
    /** Foreign key → merchants.id; cascade-delete when merchant is removed */
    merchantId: uuid('merchant_id')
        .notNull()
        .references(() => merchants.id, { onDelete: 'cascade' }),
    /** Original transaction identifier from Square or Clover */
    posTransactionId: text('pos_transaction_id').notNull(),
    /**
     * Salted SHA-256 of the customer name (lowercase, trimmed).
     * Salt = merchant's google_place_id. Used for Jaro-Winkler matching
     * without storing plaintext permanently.
     */
    nameHash: text('name_hash').notNull(),
    /**
     * Plaintext customer name — stored temporarily for the 14-day
     * matching window, then purged by purge_expired_name_plain_temp().
     * NULL after purge.
     */
    namePlainTemp: text('name_plain_temp'),
    /**
     * Timestamp after which namePlainTemp must be nulled out.
     * Set to created_at + 14 days at insert time.
     */
    namePlainExpiresAt: timestamp('name_plain_expires_at', {
        withTimezone: true,
    }),
    /**
     * JSONB array of line items from the POS receipt.
     * Schema: Array<{ name: string; quantity: number; price_cents: number }>
     * Used by Session 3 LLM extraction for line-item matching.
     */
    lineItems: jsonb('line_items').notNull(),
    /** Total transaction value in cents (avoids floating-point errors) */
    transactionAmountCents: integer('transaction_amount_cents').notNull(),
    /** UTC timestamp when the POS transaction was closed/settled */
    closedAt: timestamp('closed_at', { withTimezone: true }).notNull(),
    /** Denormalised POS provider for fast filtering without joining merchants */
    posProvider: posProviderEnum('pos_provider').notNull(),
    /**
     * AES-256-GCM encrypted copy of the full raw POS payload (JSON string).
     * Stored for audit purposes. NULL if not retained by merchant preference.
     */
    rawPayloadEnc: text('raw_payload_enc'),
    createdAt: timestamp('created_at', { withTimezone: true })
        .notNull()
        .default(sql `now()`),
}, (table) => [
    // Prevent duplicate syncs from the POS provider
    uniqueIndex('uq_merchant_pos_transaction').on(table.merchantId, table.posTransactionId),
    // ForensicMatchEngine temporal window queries
    index('idx_transactions_closed_at').on(table.closedAt),
    // Merchant-scoped lookups
    index('idx_transactions_merchant_id').on(table.merchantId),
]);
// ── Table: reviews_investigation ──────────────────────────────────────────────
export const reviewsInvestigation = pgTable('reviews_investigation', {
    /** Internal UUID primary key */
    id: uuid('id')
        .primaryKey()
        .default(sql `gen_random_uuid()`),
    /** Foreign key → merchants.id; cascade-delete when merchant is removed */
    merchantId: uuid('merchant_id')
        .notNull()
        .references(() => merchants.id, { onDelete: 'cascade' }),
    /** Google's own identifier for this review — unique across the system */
    googleReviewId: text('google_review_id').notNull().unique(),
    /** Display name as it appears on Google (used for Jaro-Winkler identity match) */
    reviewerDisplayName: text('reviewer_display_name').notNull(),
    /** Full review text — parsed by LLM in Session 3 for menu item extraction */
    reviewText: text('review_text').notNull(),
    /** Star rating 1–5 as submitted by the reviewer */
    reviewRating: integer('review_rating').notNull(),
    /** UTC timestamp of when Google published the review */
    reviewPublishedAt: timestamp('review_published_at', {
        withTimezone: true,
    }).notNull(),
    /**
     * The best-matching transaction found by the ForensicMatchEngine.
     * NULL until the engine runs or if no match was found.
     */
    matchedTransactionId: uuid('matched_transaction_id').references(() => transactionsVault.id),
    /**
     * Engine confidence score 0–100.
     * NULL until the engine runs.
     * Composite of identity (Jaro-Winkler), temporal decay, and line-item scores.
     */
    confidenceScore: integer('confidence_score'),
    /** Current forensic match disposition */
    matchStatus: matchStatusEnum('match_status').notNull().default('PENDING'),
    /**
     * True when the engine relied on LLM inference (Session 3) to produce
     * the line-item factor — surfaces in the UI for human review.
     */
    llmInferenceFlag: boolean('llm_inference_flag').notNull().default(false),
    /**
     * Per-factor scoring breakdown stored as JSONB.
     * Schema: { identity: { score: number; detail: string };
     *           temporal: { score: number; detail: string };
     *           line_item: { score: number; detail: string } }
     * NULL until engine runs.
     */
    factorBreakdown: jsonb('factor_breakdown'),
    /**
     * Timestamp set when a human merchant user explicitly confirms or dismisses
     * the investigation result (2026 ADMT compliance — all dispute actions
     * require explicit human confirmation).
     */
    humanReviewedAt: timestamp('human_reviewed_at', { withTimezone: true }),
    /** Identifier of the merchant user who confirmed/dismissed (e.g. merchant UUID or email) */
    humanReviewerId: text('human_reviewer_id'),
    /**
     * Append-only audit trail for this investigation record.
     * Schema: Array<{ event: string; actor: string; ts: string; detail?: unknown }>
     * Default is an empty array.
     */
    auditLog: jsonb('audit_log').notNull().default(sql `'[]'::jsonb`),
    /**
     * Timestamp set when the merchant exports a dispute PDF for this review.
     * NULL until exported.
     */
    disputeExportedAt: timestamp('dispute_exported_at', {
        withTimezone: true,
    }),
    /** Relative path from vault root to the generated PDF file */
    pdfPath: text('pdf_path'),
    /** Timestamp when the PDF was generated */
    pdfGeneratedAt: timestamp('pdf_generated_at', { withTimezone: true }),
    /** Case ID for the dispute (format: RG-YYYYMMDD-XXXX) */
    caseId: text('case_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
        .notNull()
        .default(sql `now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .notNull()
        .default(sql `now()`),
}, (table) => [
    // Dashboard merchant-scoped queries
    index('idx_reviews_merchant_id').on(table.merchantId),
    // Status-based dashboard filtering
    index('idx_reviews_match_status').on(table.matchStatus),
    // Time-range queries for review ingestion windows
    index('idx_reviews_published_at').on(table.reviewPublishedAt),
]);
//# sourceMappingURL=schema.js.map