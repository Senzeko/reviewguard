import { describe, it, expect } from 'vitest';
import { buildReportIdentifiersPayload } from './reportExportLineage.js';
import type { WorkspaceEvidenceScores } from './reportSummaryData.js';

describe('reportExportLineage', () => {
  it('buildReportIdentifiersPayload matches report-summary correlation fields', () => {
    const p = buildReportIdentifiersPayload(
      { windowDays: 30, generatedAt: '2026-03-28T12:00:00.000Z' },
      'workspace_rolling_sponsor_proof',
      'pdf',
    );
    expect(p.reportKind).toBe('workspace_rolling_sponsor_proof');
    expect(p.windowDays).toBe(30);
    expect(p.summaryGeneratedAt).toBe('2026-03-28T12:00:00.000Z');
    expect(p.exportFormat).toBe('pdf');
  });

  it('evidence score snapshot shape is JSON-serializable (contract)', () => {
    const scores: WorkspaceEvidenceScores = {
      observedActivation: 1,
      launchExecution: 2,
      sponsorProofStrength: 3,
      breakdown: {
        observedActivation: { a: 1 },
        launchExecution: { b: 2 },
        sponsorProofStrength: { c: 3 },
      },
    };
    const roundTrip = JSON.parse(JSON.stringify(scores)) as WorkspaceEvidenceScores;
    expect(roundTrip.sponsorProofStrength).toBe(3);
  });
});
