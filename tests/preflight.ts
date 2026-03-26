/**
 * tests/preflight.ts
 *
 * Pre-flight checklist — verifies the system is ready to ship.
 * Usage: npm run preflight
 */

import { config } from 'dotenv';
config({ override: true });

import path from 'path';
import { promises as fs } from 'fs';
import { db } from '../src/db/index.js';
import { closeDb } from '../src/db/index.js';
import { redis, connectRedis, closeRedis } from '../src/queue/client.js';
import { sql } from 'drizzle-orm';

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

async function runPreflight() {
  const checks: Check[] = [];

  // 1. Environment variables present
  const requiredEnvVars = [
    'DATABASE_URL', 'REDIS_URL', 'ENCRYPTION_KEY',
    'ANTHROPIC_API_KEY', 'GOOGLE_PLACES_API_KEY',
    'SQUARE_APPLICATION_ID', 'SQUARE_APPLICATION_SECRET',
    'CLOVER_APP_ID', 'CLOVER_APP_SECRET',
    'EVIDENCE_VAULT_PATH',
  ];
  for (const key of requiredEnvVars) {
    checks.push({
      name: `env: ${key}`,
      pass: !!process.env[key],
      detail: process.env[key] ? 'set' : 'MISSING',
    });
  }

  // 2. ENCRYPTION_KEY is exactly 64 hex characters
  const encKey = process.env['ENCRYPTION_KEY'] ?? '';
  checks.push({
    name: 'encryption key length',
    pass: /^[0-9a-f]{64}$/i.test(encKey),
    detail: encKey.length === 64 ? '64 hex chars' : `WRONG LENGTH: ${encKey.length}`,
  });

  // 3. DB connection
  try {
    await db.execute(sql`SELECT 1`);
    checks.push({ name: 'db: connectivity', pass: true, detail: 'connected' });
  } catch (e) {
    checks.push({ name: 'db: connectivity', pass: false, detail: String(e) });
  }

  // 4. Schema present
  try {
    await db.execute(sql`SELECT id FROM merchants LIMIT 1`);
    checks.push({ name: 'db: schema', pass: true, detail: 'merchants table exists' });
  } catch (e) {
    checks.push({ name: 'db: schema', pass: false, detail: 'run npm run db:migrate' });
  }

  // 5. Redis connection
  try {
    await connectRedis();
    await redis.ping();
    checks.push({ name: 'redis: connectivity', pass: true, detail: 'connected' });
  } catch (e) {
    checks.push({ name: 'redis: connectivity', pass: false, detail: String(e) });
  }

  // 6. Anthropic API key valid (minimal test call)
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });
    await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'ping' }],
    });
    checks.push({ name: 'anthropic: api key', pass: true, detail: 'valid' });
  } catch (e: any) {
    checks.push({ name: 'anthropic: api key', pass: false, detail: e.message?.slice(0, 100) ?? String(e) });
  }

  // 7. Evidence vault directory writable
  try {
    const vaultPath = process.env['EVIDENCE_VAULT_PATH'] ?? './evidence_vault';
    await fs.mkdir(vaultPath, { recursive: true });
    const testFile = path.join(vaultPath, '.preflight_write_test');
    await fs.writeFile(testFile, 'ok');
    await fs.unlink(testFile);
    checks.push({ name: 'vault: writable', pass: true, detail: vaultPath });
  } catch (e) {
    checks.push({ name: 'vault: writable', pass: false, detail: String(e) });
  }

  // 8. AES-256 round-trip
  try {
    const { encrypt, decrypt } = await import('../src/secrets/index.js');
    const blob = encrypt('preflight-test');
    const result = decrypt(blob);
    checks.push({
      name: 'crypto: AES-256 round-trip',
      pass: result === 'preflight-test',
      detail: result === 'preflight-test' ? 'ok' : 'MISMATCH',
    });
  } catch (e) {
    checks.push({ name: 'crypto: AES-256 round-trip', pass: false, detail: String(e) });
  }

  // 9. Server health endpoint
  try {
    const resp = await fetch('http://localhost:3000/health');
    checks.push({
      name: 'server: /health',
      pass: resp.ok,
      detail: resp.ok ? 'HTTP 200' : `HTTP ${resp.status}`,
    });
  } catch (e) {
    checks.push({ name: 'server: /health', pass: false, detail: 'not reachable' });
  }

  // Print results
  console.log('\n=== REVIEWGUARD AI PRE-FLIGHT CHECK ===\n');
  const maxLen = Math.max(...checks.map(c => c.name.length));
  for (const check of checks) {
    const status = check.pass ? '\x1b[32m PASS \x1b[0m' : '\x1b[31m FAIL \x1b[0m';
    console.log(`${status}  ${check.name.padEnd(maxLen)}  ${check.detail}`);
  }

  const failed = checks.filter(c => !c.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);

  // Cleanup
  try { await closeRedis(); } catch { /* ignore */ }
  try { await closeDb(); } catch { /* ignore */ }

  if (failed.length > 0) {
    console.error(`\n${failed.length} check(s) failed. Fix before deploying.\n`);
    process.exit(1);
  }
  console.log('\nAll checks passed. Ready to deploy.\n');
}

runPreflight().catch(err => {
  console.error('Preflight check failed:', err);
  process.exit(1);
});
