/**
 * Apply migrations/0015_subscriptions_stripe_nullable.sql
 */
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

config({ override: true });

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const { pool } = await import('../src/db/index.js');
  const raw = await readFile(join(__dirname, '../migrations/0015_subscriptions_stripe_nullable.sql'), 'utf8');
  const chunks = raw
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    await pool.query(chunk);
    console.log('[migrate-0015] OK:', chunk.slice(0, 80).replace(/\s+/g, ' '), '…');
  }

  await pool.end();
  console.log('[migrate-0015] Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
