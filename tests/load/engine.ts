/**
 * tests/load/engine.ts
 *
 * Load-test the API with mode-aware endpoint selection.
 * - Legacy mode: POST /internal/engine/test-match
 * - PodSignal mode: GET /health
 * Usage: npm run test:load
 */

import { config } from 'dotenv';
config({ override: true });

import autocannon from 'autocannon';
import { db } from '../../src/db/index.js';
import { reviewsInvestigation } from '../../src/db/schema.js';
import { closeDb } from '../../src/db/index.js';

type LoadTarget =
  | {
      name: 'legacy-engine';
      url: string;
      method: 'POST';
      body: string;
      headers: Record<string, string>;
      passCriteria: {
        p95LatencyMs: number;
        errorRate: number;
        minThroughput: number;
      };
    }
  | {
      name: 'podsignal-health';
      url: string;
      method: 'GET';
      body?: undefined;
      headers?: undefined;
      passCriteria: {
        p95LatencyMs: number;
        errorRate: number;
        minThroughput: number;
      };
    };

async function detectTarget(): Promise<LoadTarget> {
  const baseUrl = process.env['LOAD_TEST_BASE_URL'] ?? 'http://localhost:3000';
  const legacyUrl = `${baseUrl}/internal/engine/test-match`;

  // Probe legacy endpoint first. If unavailable (404), assume PodSignal-only mode.
  const probe = await fetch(legacyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewId: 'probe' }),
  }).catch(() => null);

  if (probe && probe.status !== 404) {
    const seedReview = await db
      .select()
      .from(reviewsInvestigation)
      .limit(1)
      .then((rows) => rows[0]);

    if (!seedReview) {
      throw new Error('No reviews in DB — run npm run db:seed first');
    }

    console.log(`[load] Mode: legacy ReviewGuard (engine endpoint)`);
    console.log(`[load] Using review ${seedReview.id}`);

    return {
      name: 'legacy-engine',
      url: legacyUrl,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewId: seedReview.id }),
      passCriteria: {
        p95LatencyMs: 3000,
        errorRate: 0.01,
        minThroughput: 2,
      },
    };
  }

  console.log('[load] Mode: PodSignal (legacy endpoint not registered)');
  console.log('[load] Falling back to /health baseline stress test');

  return {
    name: 'podsignal-health',
    url: `${baseUrl}/health`,
    method: 'GET',
    passCriteria: {
      p95LatencyMs: 1000,
      errorRate: 0.01,
      minThroughput: 100,
    },
  };
}

async function runLoadTest() {
  const target = await detectTarget();

  const result = await autocannon({
    url: target.url,
    method: target.method,
    headers: target.headers,
    body: target.body,
    connections: 5,
    duration: 15,
    timeout: 10,
  });

  console.log('\n=== ENGINE LOAD TEST RESULTS ===\n');
  console.log(`Target:            ${target.name} (${target.method} ${target.url})`);
  console.log(`Requests:          ${result.requests.total}`);
  console.log(`Throughput:        ${result.requests.average.toFixed(1)} req/s`);
  console.log(`Latency p50:       ${result.latency.p50} ms`);
  console.log(`Latency p95:       ${result.latency.p95 ?? 'N/A (using p99 fallback)'} ms`);
  console.log(`Latency p99:       ${result.latency.p99} ms`);
  console.log(`Errors:            ${result.errors}`);
  console.log(`Timeouts:          ${result.timeouts}`);
  console.log(`Non-2xx:           ${result.non2xx}`);

  // autocannon may return undefined for p95 with low sample counts — fall back to p99
  const p95 = result.latency.p95 ?? result.latency.p99 ?? result.latency.max;
  const errorRate = (result.errors + result.non2xx) / Math.max(result.requests.total, 1);
  const passed =
    p95 < target.passCriteria.p95LatencyMs &&
    errorRate < target.passCriteria.errorRate &&
    result.requests.average >= target.passCriteria.minThroughput;

  console.log(`\nPass criteria:`);
  console.log(`  p95 < ${target.passCriteria.p95LatencyMs}ms:   ${p95 < target.passCriteria.p95LatencyMs ? 'PASS' : 'FAIL'} (${p95}ms)`);
  console.log(`  error rate < 1%:  ${errorRate < target.passCriteria.errorRate ? 'PASS' : 'FAIL'} (${(errorRate * 100).toFixed(2)}%)`);
  console.log(`  throughput >= ${target.passCriteria.minThroughput}:  ${result.requests.average >= target.passCriteria.minThroughput ? 'PASS' : 'FAIL'} (${result.requests.average.toFixed(1)} req/s)`);

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
