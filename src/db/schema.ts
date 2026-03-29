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

import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
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
    .default(sql`gen_random_uuid()`),

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
    .default(sql`now()`),

  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export type Merchant = typeof merchants.$inferSelect;
export type NewMerchant = typeof merchants.$inferInsert;

// ── Table: merchant_locations ────────────────────────────────────────────────

export const merchantLocations = pgTable(
  'merchant_locations',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),

    /** Google Places identifier for this location */
    googlePlaceId: text('google_place_id').notNull().unique(),

    /** Human-readable location name (e.g. "Downtown Branch") */
    locationName: text('location_name').notNull(),

    /** Address from Google Places API */
    formattedAddress: text('formatted_address'),

    /** HMAC webhook secret unique to this location */
    webhookSecret: text('webhook_secret').notNull(),

    isActive: boolean('is_active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index('idx_locations_merchant_id').on(table.merchantId),
  ],
);

export type MerchantLocation = typeof merchantLocations.$inferSelect;

// ── Table: subscriptions ─────────────────────────────────────────────────────

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  merchantId: uuid('merchant_id')
    .references(() => merchants.id, { onDelete: 'cascade' }),
  ownerUserId: uuid('owner_user_id'),

  /** Stripe customer ID — null for free-tier PodSignal rows until first checkout */
  stripeCustomerId: text('stripe_customer_id'),

  /** Stripe subscription ID */
  stripeSubscriptionId: text('stripe_subscription_id'),

  /** 'free' | 'starter' | 'pro' | 'enterprise' */
  plan: text('plan').notNull().default('free'),

  /** 'active' | 'past_due' | 'canceled' | 'trialing' */
  status: text('status').notNull().default('active'),

  /** Monthly review limit based on plan */
  reviewLimit: integer('review_limit').notNull().default(25),

  /** Reviews used this billing period */
  reviewsUsed: integer('reviews_used').notNull().default(0),

  /**
   * Free-tier month bucket for resetting reviewsUsed (UTC `YYYY-MM`).
   * Paid workspaces with an active Stripe period use currentPeriodEnd instead.
   */
  processingQuotaPeriodKey: text('processing_quota_period_key'),

  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  stripeConnectAccountId: text('stripe_connect_account_id'),
  connectChargesEnabled: boolean('connect_charges_enabled').notNull().default(false),
  connectPayoutsEnabled: boolean('connect_payouts_enabled').notNull().default(false),
  connectDetailsSubmitted: boolean('connect_details_submitted').notNull().default(false),

  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export type Subscription = typeof subscriptions.$inferSelect;

// ── Table: merchant_users ────────────────────────────────────────────────────

export const merchantUsers = pgTable('merchant_users', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  /** NULL during onboarding — set when merchant row is created in finalize step */
  merchantId: uuid('merchant_id').references(() => merchants.id, { onDelete: 'cascade' }),

  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name').notNull(),

  /** 'owner' | 'staff' */
  role: text('role').notNull().default('owner'),

  isActive: boolean('is_active').notNull().default(true),

  /** System admin flag — grants access to /admin panel */
  isAdmin: boolean('is_admin').notNull().default(false),

  /**
   * JSONB notification preferences.
   * Schema: { onNewReview: boolean; onScoringComplete: boolean; onPdfReady: boolean; onPosSync: boolean; dailyDigest: boolean }
   */
  notificationPrefs: jsonb('notification_prefs').notNull().default(sql`'{"onNewReview":true,"onScoringComplete":true,"onPdfReady":true,"onPosSync":true,"dailyDigest":false}'::jsonb`),

  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export type MerchantUser = typeof merchantUsers.$inferSelect;

// ── Table: sessions ──────────────────────────────────────────────────────────

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    userId: uuid('user_id')
      .notNull()
      .references(() => merchantUsers.id, { onDelete: 'cascade' }),

    token: text('token').notNull().unique(),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index('idx_sessions_token').on(table.token),
    index('idx_sessions_expires_at').on(table.expiresAt),
  ],
);

// ── Table: onboarding_state ──────────────────────────────────────────────────

export const onboardingState = pgTable('onboarding_state', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

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
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// ── Table: transactions_vault ─────────────────────────────────────────────────

export const transactionsVault = pgTable(
  'transactions_vault',
  {
    /** Internal UUID primary key */
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

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
      .default(sql`now()`),
  },
  (table) => [
    // Prevent duplicate syncs from the POS provider
    uniqueIndex('uq_merchant_pos_transaction').on(
      table.merchantId,
      table.posTransactionId,
    ),
    // ForensicMatchEngine temporal window queries
    index('idx_transactions_closed_at').on(table.closedAt),
    // Merchant-scoped lookups
    index('idx_transactions_merchant_id').on(table.merchantId),
  ],
);

export type Transaction = typeof transactionsVault.$inferSelect;
export type NewTransaction = typeof transactionsVault.$inferInsert;

/** Line-item shape stored in transactions_vault.line_items */
export interface LineItem {
  name: string;
  quantity: number;
  price_cents: number;
}

// ── Table: reviews_investigation ──────────────────────────────────────────────

export const reviewsInvestigation = pgTable(
  'reviews_investigation',
  {
    /** Internal UUID primary key */
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

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
    matchedTransactionId: uuid('matched_transaction_id').references(
      () => transactionsVault.id,
    ),

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
    auditLog: jsonb('audit_log').notNull().default(sql`'[]'::jsonb`),

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
      .default(sql`now()`),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    // Dashboard merchant-scoped queries
    index('idx_reviews_merchant_id').on(table.merchantId),
    // Status-based dashboard filtering
    index('idx_reviews_match_status').on(table.matchStatus),
    // Time-range queries for review ingestion windows
    index('idx_reviews_published_at').on(table.reviewPublishedAt),
  ],
);

export type ReviewInvestigation = typeof reviewsInvestigation.$inferSelect;
export type NewReviewInvestigation = typeof reviewsInvestigation.$inferInsert;

/** Audit log entry shape stored in reviews_investigation.audit_log */
export interface AuditLogEntry {
  event: string;
  actor: string;
  ts: string; // ISO 8601
  detail?: unknown;
}

/** Factor breakdown shape stored in reviews_investigation.factor_breakdown */
export interface FactorBreakdown {
  identity: { score: number; detail: string };
  temporal: { score: number; detail: string };
  line_item: { score: number; detail: string };
}

// ── PodSignal enums/tables ───────────────────────────────────────────────────

export const episodeStatusEnum = pgEnum('episode_status', [
  'DRAFT',
  'PROCESSING',
  'READY',
  'FAILED',
  'PUBLISHED',
  'ARCHIVED',
]);

export const signalTypeEnum = pgEnum('signal_type', [
  'HIGHLIGHT',
  'TOPIC_SHIFT',
  'QUOTE',
  'QUESTION',
  'AD_BREAK',
  'INTRO',
  'OUTRO',
]);

export const campaignStatusEnum = pgEnum('campaign_status', [
  'DRAFT',
  'ACTIVE',
  'COMPLETED',
  'ARCHIVED',
]);

export const podcasts = pgTable(
  'podcasts',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => merchantUsers.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    artworkUrl: text('artwork_url'),
    rssFeedUrl: text('rss_feed_url'),
    spotifyId: text('spotify_id'),
    applePodcastId: text('apple_podcast_id'),
    settings: jsonb('settings').notNull().default(sql`'{}'::jsonb`),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    index('idx_podcasts_owner_id').on(table.ownerId),
  ],
);

export const episodes = pgTable(
  'episodes',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    podcastId: uuid('podcast_id')
      .notNull()
      .references(() => podcasts.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    audioUrl: text('audio_url'),
    audioLocalRelPath: text('audio_local_rel_path'),
    audioMimeType: text('audio_mime_type'),
    durationSeconds: integer('duration_seconds'),
    episodeNumber: integer('episode_number'),
    seasonNumber: integer('season_number'),
    transcript: text('transcript'),
    summary: text('summary'),
    chapters: jsonb('chapters'),
    status: episodeStatusEnum('status').notNull().default('DRAFT'),
    processingError: text('processing_error'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    index('idx_episodes_podcast_id').on(table.podcastId),
    index('idx_episodes_status').on(table.status),
    index('idx_episodes_published_at').on(table.publishedAt),
  ],
);

export const signals = pgTable(
  'signals',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    episodeId: uuid('episode_id')
      .notNull()
      .references(() => episodes.id, { onDelete: 'cascade' }),
    type: signalTypeEnum('type').notNull(),
    startSec: integer('start_sec').notNull(),
    endSec: integer('end_sec').notNull(),
    confidence: integer('confidence').notNull(),
    label: text('label').notNull(),
    transcriptSnippet: text('transcript_snippet'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [index('idx_signals_episode_id').on(table.episodeId), index('idx_signals_type').on(table.type)],
);

export const clips = pgTable(
  'clips',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    episodeId: uuid('episode_id')
      .notNull()
      .references(() => episodes.id, { onDelete: 'cascade' }),
    signalId: uuid('signal_id').references(() => signals.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    startSec: integer('start_sec').notNull(),
    endSec: integer('end_sec').notNull(),
    clipUrl: text('clip_url'),
    transcriptSnippet: text('transcript_snippet'),
    isPublished: boolean('is_published').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [index('idx_clips_episode_id').on(table.episodeId)],
);

export const transcriptSegments = pgTable(
  'transcript_segments',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    episodeId: uuid('episode_id')
      .notNull()
      .references(() => episodes.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull().default(0),
    startMs: integer('start_ms').notNull(),
    endMs: integer('end_ms').notNull(),
    text: text('text').notNull(),
    speaker: text('speaker'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [index('idx_transcript_segments_episode_id').on(table.episodeId)],
);

export const campaigns = pgTable('campaigns', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  episodeId: uuid('episode_id')
    .notNull()
    .references(() => episodes.id, { onDelete: 'cascade' }),
  status: campaignStatusEnum('status').notNull().default('DRAFT'),
  utmCampaign: text('utm_campaign'),
  /** Draft / approved selections for launch packaging (title, clips, guest kit, channels). */
  launchPack: jsonb('launch_pack').notNull().default(sql`'{}'::jsonb`),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});

export const campaignTasks = pgTable(
  'campaign_tasks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    taskType: text('task_type').notNull().default('custom'),
    label: text('label').notNull(),
    doneAt: timestamp('done_at', { withTimezone: true }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [index('idx_campaign_tasks_campaign_id').on(table.campaignId)],
);

/** Tracks selection, approval, copy, and export of PodSignal-generated assets (product learning loop). */
export const podsignalOutputUsage = pgTable(
  'podsignal_output_usage',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => merchantUsers.id, { onDelete: 'cascade' }),
    episodeId: uuid('episode_id').references(() => episodes.id, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    index('idx_podsignal_output_usage_user').on(table.userId),
    index('idx_podsignal_output_usage_episode').on(table.episodeId),
    index('idx_podsignal_output_usage_created').on(table.createdAt),
  ],
);

/** Short-token redirect URLs for observed click attribution (guest share, newsletter, social). */
export const podsignalTrackableLinks = pgTable(
  'podsignal_trackable_links',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    token: text('token').notNull().unique(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => merchantUsers.id, { onDelete: 'cascade' }),
    episodeId: uuid('episode_id')
      .notNull()
      .references(() => episodes.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    assetKind: text('asset_kind').notNull(),
    channel: text('channel'),
    targetUrl: text('target_url').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    index('idx_podsignal_trackable_links_episode').on(table.episodeId),
  ],
);

export const podsignalLinkClicks = pgTable(
  'podsignal_link_clicks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    linkId: uuid('link_id')
      .notNull()
      .references(() => podsignalTrackableLinks.id, { onDelete: 'cascade' }),
    clickedAt: timestamp('clicked_at', { withTimezone: true }).notNull().default(sql`now()`),
    referer: text('referer'),
  },
  (table) => [
    index('idx_podsignal_link_clicks_link').on(table.linkId),
    index('idx_podsignal_link_clicks_clicked').on(table.clickedAt),
  ],
);

/**
 * Legacy pilot “Analytics” self-reported host metrics (migration 0014).
 * Prefer `podsignal_performance_snapshots` for new code — explicit evidence_class + campaign linkage.
 */
export const podsignalHostMetricSnapshots = pgTable(
  'podsignal_host_metric_snapshots',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => merchantUsers.id, { onDelete: 'cascade' }),
    episodeId: uuid('episode_id').references(() => episodes.id, { onDelete: 'set null' }),
    metricKey: text('metric_key').notNull(),
    customLabel: text('custom_label'),
    value: bigint('value', { mode: 'number' }).notNull(),
    sourceNote: text('source_note').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    index('idx_podsignal_host_metrics_user').on(table.userId),
    index('idx_podsignal_host_metrics_created').on(table.createdAt),
  ],
);

/** First-class generated/selectable launch assets (lineage for evidence graph + reranking). */
export const podsignalAssetVariants = pgTable(
  'podsignal_asset_variants',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => merchantUsers.id, { onDelete: 'cascade' }),
    podcastId: uuid('podcast_id').references(() => podcasts.id, { onDelete: 'cascade' }),
    episodeId: uuid('episode_id').references(() => episodes.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    assetType: text('asset_type').notNull(),
    channel: text('channel'),
    variantKey: text('variant_key').notNull().default(''),
    contentJson: jsonb('content_json').notNull().default(sql`'{}'::jsonb`),
    sourceGenerationVersion: text('source_generation_version'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    index('idx_podsignal_asset_variants_owner').on(table.ownerId),
    index('idx_podsignal_asset_variants_episode').on(table.episodeId),
    index('idx_podsignal_asset_variants_campaign').on(table.campaignId),
  ],
);

/** Canonical time windows for anchoring observed metrics and sponsor reports. */
export const podsignalLaunchWindows = pgTable(
  'podsignal_launch_windows',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => merchantUsers.id, { onDelete: 'cascade' }),
    episodeId: uuid('episode_id')
      .notNull()
      .references(() => episodes.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
    windowType: text('window_type').notNull().default('custom'),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    index('idx_podsignal_launch_windows_episode').on(table.episodeId),
    index('idx_podsignal_launch_windows_owner').on(table.ownerId),
  ],
);

/**
 * Generalized performance snapshots for the Launch Evidence Graph (migration 0017+).
 * Use for new features; `podsignal_host_metric_snapshots` remains the legacy pilot store.
 */
export const podsignalPerformanceSnapshots = pgTable(
  'podsignal_performance_snapshots',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => merchantUsers.id, { onDelete: 'cascade' }),
    episodeId: uuid('episode_id').references(() => episodes.id, { onDelete: 'set null' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    source: text('source').notNull().default('manual'),
    snapshotType: text('snapshot_type').notNull().default('other'),
    metricName: text('metric_name').notNull(),
    metricValue: bigint('metric_value', { mode: 'number' }).notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().default(sql`now()`),
    evidenceClass: text('evidence_class').notNull().default('proxy'),
    notes: text('notes').notNull().default(''),
  },
  (table) => [
    index('idx_podsignal_perf_snap_episode').on(table.episodeId),
    index('idx_podsignal_perf_snap_owner').on(table.ownerId),
  ],
);

/** Guest / topic tags per episode for amplification signals (estimated tier). */
export const podsignalGuestTopicLinks = pgTable(
  'podsignal_guest_topic_links',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    episodeId: uuid('episode_id')
      .notNull()
      .references(() => episodes.id, { onDelete: 'cascade' }),
    guestName: text('guest_name'),
    guestOrg: text('guest_org'),
    topicLabel: text('topic_label'),
    confidence: text('confidence').notNull().default('medium'),
    source: text('source').notNull().default('manual'),
  },
  (table) => [index('idx_podsignal_guest_topic_episode').on(table.episodeId)],
);

/**
 * Structured log of sponsor / launch report exports (first-class graph node).
 * `evidence_scores_json` / `report_identifiers_json` require migration 0018.
 */
export const podsignalReportExports = pgTable(
  'podsignal_report_exports',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => merchantUsers.id, { onDelete: 'cascade' }),
    episodeId: uuid('episode_id').references(() => episodes.id, { onDelete: 'set null' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    reportType: text('report_type').notNull().default('sponsor_proof'),
    exportFormat: text('export_format').notNull(),
    exportedBy: uuid('exported_by').references(() => merchantUsers.id, { onDelete: 'set null' }),
    exportedAt: timestamp('exported_at', { withTimezone: true }).notNull().default(sql`now()`),
    /** Snapshot of WorkspaceEvidenceScores at export time (migration 0018). */
    evidenceScoresJson: jsonb('evidence_scores_json').notNull().default(sql`'{}'::jsonb`),
    /** Report kind, rolling window, summary.generatedAt, optional correlation ids. */
    reportIdentifiersJson: jsonb('report_identifiers_json').notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [
    index('idx_podsignal_report_exports_owner').on(table.ownerId),
    index('idx_podsignal_report_exports_episode').on(table.episodeId),
  ],
);
