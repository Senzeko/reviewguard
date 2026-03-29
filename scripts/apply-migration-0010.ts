/**
 * One-off: apply migrations/0010_connect_accounts.sql when
 * `drizzle-kit migrate` cannot run (e.g. journal out of sync with DB).
 */
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

config({ override: true });

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const { pool } = await import('../src/db/index.js');
  const raw = await readFile(
    join(__dirname, '../migrations/0010_connect_accounts.sql'),
    'utf8',
  );
  const chunks = raw
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    await pool.query(chunk);
    console.log('[migrate-0010] OK:', chunk.slice(0, 60).replace(/\s+/g, ' '), '…');
  }

  await pool.end();
  console.log('[migrate-0010] Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
