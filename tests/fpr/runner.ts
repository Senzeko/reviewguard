/**
 * tests/fpr/runner.ts
 *
 * Scores all 50 ground-truth cases and measures FPR/FNR.
 * Usage: npm run test:fpr
 */

import { config } from 'dotenv';
config({ override: true });

import { FPR_DATASET, type FprCase } from './dataset.js';
import { ForensicMatchEngine } from '../../src/engine/index.js';
import { createTestMerchant, deleteTestMerchant } from '../fixtures/merchant.js';
import { createTestTransaction } from '../fixtures/transactions.js';
import { db } from '../../src/db/index.js';
import { closeDb } from '../../src/db/index.js';

interface FprResult {
  caseId: string;
  expectedOutcome: 'GENUINE' | 'FAKE';
  actualScore: number;
  actualStatus: string;
  consoleTier: string;
  engineDecision: 'FLAG' | 'PASS';
  correct: boolean;
  llmInferenceFlag: boolean;
}

function computeConsoleTier(matchStatus: string, score: number): string {
  if (matchStatus === 'PENDING' || matchStatus === 'PROCESSING') return 'NOT_READY';
  if (score >= 75 && matchStatus === 'VERIFIED') return 'LEGITIMATE';
  if (score >= 50 && matchStatus !== 'NO_RECORD') return 'ADVISORY';
  return 'DISPUTABLE';
}

async function runFprTest(fprCase: FprCase): Promise<FprResult> {
  const merchant = await createTestMerchant({
    businessName: `FPR Test ${fprCase.id}`,
  });

  try {
    // Insert transaction if not null
    const transactions: Array<{
      id: string;
      namePlainTemp: string | null;
      namePlainExpiresAt: Date | null;
      lineItems: Array<{ name: string; quantity: number; price_cents: number }>;
      closedAt: Date;
    }> = [];

    if (fprCase.transaction) {
      const txnId = await createTestTransaction({
        merchantId: merchant.id,
        posTransactionId: `FPR-TXN-${fprCase.id}`,
        customerName: fprCase.transaction.customerName,
        lineItems: fprCase.transaction.lineItems,
        closedAt: new Date(fprCase.transaction.closedAt),
        googlePlaceId: merchant.googlePlaceId,
      });

      transactions.push({
        id: txnId,
        namePlainTemp: fprCase.transaction.customerName,
        namePlainExpiresAt: new Date(
          new Date(fprCase.transaction.closedAt).getTime() + 14 * 24 * 60 * 60 * 1000
        ),
        lineItems: fprCase.transaction.lineItems,
        closedAt: new Date(fprCase.transaction.closedAt),
      });
    }

    const engine = new ForensicMatchEngine();
    const result = await engine.match(
      {
        id: `fpr-review-${fprCase.id}`,
        reviewerDisplayName: fprCase.review.reviewerDisplayName,
        reviewText: fprCase.review.reviewText,
        reviewPublishedAt: new Date(fprCase.review.publishedAt),
        merchantId: merchant.id,
      },
      transactions,
    );

    const engineDecision: 'FLAG' | 'PASS' =
      result.match_status === 'MISMATCH' || result.confidence_score < 50
        ? 'FLAG'
        : 'PASS';

    const correct =
      (fprCase.expectedOutcome === 'FAKE' && engineDecision === 'FLAG') ||
      (fprCase.expectedOutcome === 'GENUINE' && engineDecision === 'PASS');

    return {
      caseId: fprCase.id,
      expectedOutcome: fprCase.expectedOutcome,
      actualScore: result.confidence_score,
      actualStatus: result.match_status,
      consoleTier: computeConsoleTier(result.match_status, result.confidence_score),
      engineDecision,
      correct,
      llmInferenceFlag: result.llm_inference_flag,
    };
  } finally {
    await deleteTestMerchant(merchant.id);
  }
}

async function runAllFprTests(): Promise<{
  results: FprResult[];
  summary: {
    total: number;
    truePositives: number;
    trueNegatives: number;
    falsePositives: number;
    falseNegatives: number;
    falsePositiveRate: number;
    falseNegativeRate: number;
    accuracy: number;
    llmCallCount: number;
  };
}> {
  const results: FprResult[] = [];

  for (const fprCase of FPR_DATASET) {
    try {
      console.log(`  Running ${fprCase.id}: ${fprCase.description}...`);
      const result = await runFprTest(fprCase);
      results.push(result);
      const mark = result.correct ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
      console.log(`    ${mark} score=${result.actualScore}, status=${result.actualStatus}, decision=${result.engineDecision}`);
    } catch (err) {
      console.error(`  FAIL ${fprCase.id}:`, err);
      results.push({
        caseId: fprCase.id,
        expectedOutcome: fprCase.expectedOutcome,
        actualScore: 0,
        actualStatus: 'ERROR',
        consoleTier: 'DISPUTABLE',
        engineDecision: 'FLAG',
        correct: fprCase.expectedOutcome === 'FAKE',
        llmInferenceFlag: false,
      });
    }
  }

  const truePositives = results.filter(r => r.expectedOutcome === 'FAKE' && r.engineDecision === 'FLAG').length;
  const trueNegatives = results.filter(r => r.expectedOutcome === 'GENUINE' && r.engineDecision === 'PASS').length;
  const falsePositives = results.filter(r => r.expectedOutcome === 'GENUINE' && r.engineDecision === 'FLAG').length;
  const falseNegatives = results.filter(r => r.expectedOutcome === 'FAKE' && r.engineDecision === 'PASS').length;
  const llmCallCount = results.filter(r => r.llmInferenceFlag).length;

  return {
    results,
    summary: {
      total: results.length,
      truePositives,
      trueNegatives,
      falsePositives,
      falseNegatives,
      falsePositiveRate: falsePositives / Math.max(falsePositives + trueNegatives, 1),
      falseNegativeRate: falseNegatives / Math.max(falseNegatives + truePositives, 1),
      accuracy: (truePositives + trueNegatives) / Math.max(results.length, 1),
      llmCallCount,
    },
  };
}

// Entry point
runAllFprTests().then(async ({ results, summary }) => {
  console.log('\n=== FALSE-POSITIVE RATE TEST RESULTS ===\n');
  console.table(results.map(r => ({
    id: r.caseId,
    expected: r.expectedOutcome,
    decision: r.engineDecision,
    score: r.actualScore,
    status: r.actualStatus,
    correct: r.correct ? 'YES' : 'NO',
  })));

  console.log('\n=== SUMMARY ===');
  console.log(`Total cases:       ${summary.total}`);
  console.log(`True positives:    ${summary.truePositives}`);
  console.log(`True negatives:    ${summary.trueNegatives}`);
  console.log(`False positives:   ${summary.falsePositives}`);
  console.log(`False negatives:   ${summary.falseNegatives}`);
  console.log(`FP rate:           ${(summary.falsePositiveRate * 100).toFixed(1)}%  (target: <15%)`);
  console.log(`FN rate:           ${(summary.falseNegativeRate * 100).toFixed(1)}%  (target: <30%)`);
  console.log(`Accuracy:          ${(summary.accuracy * 100).toFixed(1)}%`);
  console.log(`LLM calls made:    ${summary.llmCallCount}`);

  await closeDb();

  if (summary.falsePositiveRate > 0.15) {
    console.error('\nFAIL: False positive rate exceeds 15% threshold');
    process.exit(1);
  }
  if (summary.falseNegativeRate > 0.30) {
    console.error('\nFAIL: False negative rate exceeds 30% threshold');
    process.exit(1);
  }
  console.log('\nPASS: FPR and FNR within acceptable thresholds');
  process.exit(0);
}).catch(async (err) => {
  console.error('FPR test runner failed:', err);
  await closeDb();
  process.exit(1);
});
