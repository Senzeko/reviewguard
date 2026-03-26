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
export declare const env: {
    DATABASE_URL: string;
    REDIS_URL: string;
    ENCRYPTION_KEY: string;
    ANTHROPIC_API_KEY: string;
    GOOGLE_PLACES_API_KEY: string;
    SQUARE_APPLICATION_ID: string;
    SQUARE_APPLICATION_SECRET: string;
    CLOVER_APP_ID: string;
    CLOVER_APP_SECRET: string;
    NODE_ENV: "development" | "production" | "test";
    PORT: number;
    EVIDENCE_VAULT_PATH: string;
};
export type Env = typeof env;
//# sourceMappingURL=env.d.ts.map