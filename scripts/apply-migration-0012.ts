/**
 * One-off: apply migrations/0012_podsignal_output_usage.sql
 */
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

config({ override: true });

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const { pool } = await import('../src/db/index.js');
  const raw = await readFile(join(__dirname, '../migrations/0012_podsignal_output_usage.sql'), 'utf8');
  const chunks = raw
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    await pool.query(chunk);
    console.log('[migrate-0012] OK:', chunk.slice(0, 70).replace(/\s+/g, ' '), '…');
  }

  await pool.end();
  console.log('[migrate-0012] Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
