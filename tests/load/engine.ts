/**
 * tests/load/engine.ts
 *
 * Load-test the internal engine endpoint (POST /internal/engine/test-match).
 * Usage: npm run test:load
 */

import { config } from 'dotenv';
config({ override: true });

import autocannon from 'autocannon';
import { db } from '../../src/db/index.js';
import { reviewsInvestigation } from '../../src/db/schema.js';
import { closeDb } from '../../src/db/index.js';

async function runLoadTest() {
  // Get a review ID to test with
  const seedReview = await db.select()
    .from(reviewsInvestigation)
    .limit(1)
    .then(rows => rows[0]);

  if (!seedReview) {
    throw new Error('No reviews in DB — run npm run db:seed first');
  }

  console.log(`Using review ${seedReview.id} for load test...\n`);

  const result = await autocannon({
    url: 'http://localhost:3000/internal/engine/test-match',
    method: 'POST' as const,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewId: seedReview.id }),
    connections: 5,
    duration: 15,
    timeout: 10,
  });

  console.log('\n=== ENGINE LOAD TEST RESULTS ===\n');
  console.log(`Requests:          ${result.requests.total}`);
  console.log(`Throughput:        ${result.requests.average.toFixed(1)} req/s`);
  console.log(`Latency p50:       ${result.latency.p50} ms`);
  console.log(`Latency p95:       ${result.latency.p95 ?? 'N/A (using p99 fallback)'} ms`);
  console.log(`Latency p99:       ${result.latency.p99} ms`);
  console.log(`Errors:            ${result.errors}`);
  console.log(`Timeouts:          ${result.timeouts}`);
  console.log(`Non-2xx:           ${result.non2xx}`);

  const PASS_CRITERIA = {
    p95LatencyMs: 3000,
    errorRate: 0.01,
    minThroughput: 2,
  };

  // autocannon may return undefined for p95 with low sample counts — fall back to p99
  const p95 = result.latency.p95 ?? result.latency.p99 ?? result.latency.max;
  const errorRate = (result.errors + result.non2xx) / Math.max(result.requests.total, 1);
  const passed =
    p95 < PASS_CRITERIA.p95LatencyMs &&
    errorRate < PASS_CRITERIA.errorRate &&
    result.requests.average >= PASS_CRITERIA.minThroughput;

  console.log(`\nPass criteria:`);
  console.log(`  p95 < ${PASS_CRITERIA.p95LatencyMs}ms:   ${p95 < PASS_CRITERIA.p95LatencyMs ? 'PASS' : 'FAIL'} (${p95}ms)`);
  console.log(`  error rate < 1%:  ${errorRate < PASS_CRITERIA.errorRate ? 'PASS' : 'FAIL'} (${(errorRate * 100).toFixed(2)}%)`);
  console.log(`  throughput >= 2:  ${result.requests.average >= PASS_CRITERIA.minThroughput ? 'PASS' : 'FAIL'} (${result.requests.average.toFixed(1)} req/s)`);

  await closeDb();

  if (!passed) {
    process.exit(1);
  }
}

runLoadTest().catch(async (err) => {
  console.error('Load test failed:', err);
  await closeDb();
  process.exit(1);
});
