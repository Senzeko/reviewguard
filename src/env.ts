/**
 * src/env.ts
 *
 * PodSignal environment variables.
 * Parsed and validated with zod at import time.
 *
 * Import this module FIRST in every entry point:
 *   import { env } from './env.js';
 */

import { z } from 'zod';
import { config } from 'dotenv';

// Load .env file into process.env before validation.
// Never override existing environment variables: platform-injected secrets/URLs must win.
config();

const envSchema = z.object({
// ── Database ───────────────────────────────────────────────────────────────
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .describe('PostgreSQL connection string'),

  // ── Redis ──────────────────────────────────────────────────────────────────
  REDIS_URL: z
    .string()
    .min(1, 'REDIS_URL is required')
    .describe('Redis connection string'),

  // ── Encryption ─────────────────────────────────────────────────────────────
  ENCRYPTION_KEY: z
    .string()
    .length(64, 'ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)')
    .regex(/^[0-9a-fA-F]+$/, 'ENCRYPTION_KEY must be a hex string')
    .describe('AES-256-GCM key for POS credential encryption'),

  // ── Anthropic (used by transcription/summarization jobs) ──────────────────
  ANTHROPIC_API_KEY: z
    .string()
    .min(1, 'ANTHROPIC_API_KEY is required')
    .describe('Anthropic API key for LLM line-item extraction (Session 3)'),

  // ── Optional legacy integrations (kept optional for compatibility) ────────
  GOOGLE_PLACES_API_KEY: z.string().optional().default(''),
  SQUARE_APPLICATION_ID: z.string().optional().default(''),
  SQUARE_APPLICATION_SECRET: z.string().optional().default(''),
  CLOVER_APP_ID: z.string().optional().default(''),
  CLOVER_APP_SECRET: z.string().optional().default(''),
  YOUTUBE_DATA_API_KEY: z.string().optional().default(''),

  // ── Runtime ────────────────────────────────────────────────────────────────
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development')
    .describe('Node environment'),

  PORT: z
    .string()
    .regex(/^\d+$/, 'PORT must be a numeric string')
    .default('3000')
    .transform(Number)
    .describe('HTTP server port (Session 2)'),

  APP_URL: z
    .string()
    .optional()
    .default('')
    .describe('Public app URL used for redirects/email links'),
  CORS_ORIGINS: z
    .string()
    .optional()
    .default('')
    .describe('Comma-separated allowed CORS origins (empty => APP_URL only in prod)'),
  RATE_LIMIT_ENABLED: z
    .string()
    .optional()
    .default('true')
    .transform((v) => v.trim().toLowerCase() !== 'false')
    .describe('Enable HTTP rate limiting (set false to disable)'),
  RATE_LIMIT_MAX: z
    .string()
    .optional()
    .default('120')
    .transform((v) => Number.parseInt(v, 10))
    .describe('Max requests per time window per IP'),
  RATE_LIMIT_TIME_WINDOW: z
    .string()
    .optional()
    .default('1 minute')
    .describe('Rate limit time window, e.g. \"1 minute\"'),

  // ── Media / file storage ──────────────────────────────────────────────────
  EVIDENCE_VAULT_PATH: z
    .string()
    .default('./evidence_vault')
    .describe('Absolute or relative path to evidence vault directory'),
  MEDIA_VAULT_PATH: z
    .string()
    .default('./media_vault')
    .describe('Absolute or relative path to media/audio vault directory'),
  TRANSCRIPTION_PROVIDER: z.string().optional().default('stub'),
  ASSEMBLYAI_API_KEY: z.string().optional().default(''),
});

/**
 * Parse process.env. On failure, print a human-readable summary of every
 * missing / invalid variable and exit with code 1.
 */
function parseEnv(): z.infer<typeof envSchema> {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(
      `\n[PodSignal] Fatal: environment validation failed:\n${issues}\n` +
        `  → Copy .env.example to .env and fill in all required values.\n`,
    );
    process.exit(1);
  }

  return result.data;
}

export const env = parseEnv();
export type Env = typeof env;
