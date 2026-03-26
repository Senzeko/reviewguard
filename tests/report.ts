/**
 * tests/report.ts
 *
 * Unified test report generator — prints a summary of all test suites.
 * Usage: npm run test:report
 */

import { config } from 'dotenv';
config({ override: true });

import { execSync } from 'child_process';

interface SuiteResult {
  name: string;
  passed: boolean;
  output: string;
}

function runSuite(name: string, command: string): SuiteResult {
  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      timeout: 300_000,
      cwd: process.cwd(),
    });
    return { name, passed: true, output };
  } catch (err: any) {
    return { name, passed: false, output: err.stdout ?? err.message };
  }
}

async function main() {
  console.log('\n=== REVIEWGUARD AI — UNIFIED TEST REPORT ===\n');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Node: ${process.version}`);
  console.log('');

  const suites: SuiteResult[] = [];

  console.log('Running unit tests...');
  suites.push(runSuite('Unit Tests (vitest)', 'npx vitest run 2>&1'));

  console.log('Running backend typecheck...');
  suites.push(runSuite('Backend Typecheck', 'npx tsc --noEmit 2>&1'));

  console.log('Running client typecheck...');
  suites.push(runSuite('Client Typecheck', 'cd client && npx tsc --noEmit 2>&1'));

  console.log('\n=== RESULTS ===\n');

  for (const suite of suites) {
    const icon = suite.passed ? '\x1b[32m PASS \x1b[0m' : '\x1b[31m FAIL \x1b[0m';
    console.log(`${icon}  ${suite.name}`);
  }

  const failed = suites.filter(s => !s.passed);
  console.log(`\n${suites.length - failed.length}/${suites.length} suites passed`);

  if (failed.length > 0) {
    console.error(`\n${failed.length} suite(s) failed:\n`);
    for (const f of failed) {
      console.error(`--- ${f.name} ---`);
      console.error(f.output.slice(-500));
      console.error('');
    }
    process.exit(1);
  }

  console.log('\nAll checks passed.\n');
}

main().catch(err => {
  console.error('Report failed:', err);
  process.exit(1);
});
