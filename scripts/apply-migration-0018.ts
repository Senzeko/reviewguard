/**
 * Apply migrations/0018_report_export_lineage_columns.sql
 */
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

config({ override: true });

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const { pool } = await import('../src/db/index.js');
  const raw = await readFile(
    join(__dirname, '../migrations/0018_report_export_lineage_columns.sql'),
    'utf8',
  );
  const chunks = raw
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    await pool.query(chunk);
    console.log('[migrate-0018] OK:', chunk.slice(0, 80).replace(/\s+/g, ' '), '…');
  }

  await pool.end();
  console.log('[migrate-0018] Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
