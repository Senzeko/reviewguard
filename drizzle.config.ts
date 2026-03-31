import type { Config } from 'drizzle-kit';
import { config } from 'dotenv';

// Load .env so drizzle-kit CLI picks up DATABASE_URL when shell env is absent.
// Never override existing env vars: Railway/CI injected DATABASE_URL must win.
config();

// We load DATABASE_URL directly here to avoid a circular dependency
// (env.ts imports from this file indirectly via drizzle-kit CLI).
// The full zod validation still runs when the app starts via src/index.ts.
const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DATABASE_URL must be set for drizzle-kit commands');
}

export default {
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
} satisfies Config;
