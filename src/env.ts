/**
 * src/env.ts
 *
 * Single source of truth for all environment variables.
 * Parsed and validated with zod at import time — the process will throw
 * a descriptive error and exit if any required variable is missing or invalid.
 *
 * Import this module FIRST in every entry point:
 *   import { env } from './env.js';
 */

import { z } from 'zod';
import { config } from 'dotenv';

// Load .env file into process.env before validation.
// override: true ensures .env values take precedence over empty shell vars
// (common in dev when ANTHROPIC_API_KEY etc. are set but empty in the parent shell).
// In production, real env vars are injected by the platform and .env is absent — that's fine.
config({ override: true });

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

  // ── Anthropic ──────────────────────────────────────────────────────────────
  ANTHROPIC_API_KEY: z
    .string()
    .min(1, 'ANTHROPIC_API_KEY is required')
    .describe('Anthropic API key for LLM line-item extraction (Session 3)'),

  // ── Google ─────────────────────────────────────────────────────────────────
  GOOGLE_PLACES_API_KEY: z
    .string()
    .min(1, 'GOOGLE_PLACES_API_KEY is required')
    .describe('Google Places API key for webhook verification (Session 2)'),

  // ── Square ─────────────────────────────────────────────────────────────────
  SQUARE_APPLICATION_ID: z
    .string()
    .min(1, 'SQUARE_APPLICATION_ID is required')
    .describe('Square OAuth application ID (Session 2)'),

  SQUARE_APPLICATION_SECRET: z
    .string()
    .min(1, 'SQUARE_APPLICATION_SECRET is required')
    .describe('Square OAuth application secret (Session 2)'),

  // ── Clover ─────────────────────────────────────────────────────────────────
  CLOVER_APP_ID: z
    .string()
    .min(1, 'CLOVER_APP_ID is required')
    .describe('Clover OAuth application ID (Session 2)'),

  CLOVER_APP_SECRET: z
    .string()
    .min(1, 'CLOVER_APP_SECRET is required')
    .describe('Clover OAuth application secret (Session 2)'),

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

  // ── Evidence Vault ───────────────────────────────────────────────────────
  EVIDENCE_VAULT_PATH: z
    .string()
    .default('./evidence_vault')
    .describe('Absolute or relative path to evidence vault directory'),
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
      `\n[ReviewGuard] Fatal: environment validation failed:\n${issues}\n` +
        `  → Copy .env.example to .env and fill in all required values.\n`,
    );
    process.exit(1);
  }

  return result.data;
}

export const env = parseEnv();
export type Env = typeof env;
