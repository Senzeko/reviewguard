/**
 * First-class export lineage for the Launch Evidence Graph (podsignal_report_exports).
 * No-ops when migration 0017 is not applied; uses full JSON columns when migration 0018 is applied.
 */

import { db, pool } from '../db/index.js';
import { podsignalReportExports } from '../db/schema.js';
import { isLaunchEvidenceGraphSchemaAvailable } from '../server/launchEvidenceGraphGuard.js';
import type { PodsignalReportSummary, WorkspaceEvidenceScores } from './reportSummaryData.js';

export interface ReportIdentifiersPayload {
  /** e.g. workspace_rolling_sponsor_proof */
  reportKind: string;
  windowDays: number;
  /** ISO timestamp from report summary (generation instant). */
  summaryGeneratedAt: string;
  /** Export format for correlation with output_usage payload */
  exportFormat: string;
}

export function buildReportIdentifiersPayload(
  summary: Pick<PodsignalReportSummary, 'windowDays' | 'generatedAt'>,
  reportKind: string,
  exportFormat: string,
): ReportIdentifiersPayload {
  return {
    reportKind,
    windowDays: summary.windowDays,
    summaryGeneratedAt: summary.generatedAt,
    exportFormat,
  };
}

async function hasReportExportLineageJsonColumns(): Promise<boolean> {
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'podsignal_report_exports'
         AND column_name = 'evidence_scores_json' LIMIT 1`,
    );
    return (r.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

export interface InsertReportExportLineageParams {
  ownerId: string;
  episodeId: string | null;
  campaignId: string | null;
  reportType: string;
  exportFormat: string;
  exportedBy: string;
  evidenceScores: WorkspaceEvidenceScores;
  reportIdentifiers: ReportIdentifiersPayload;
}

/**
 * Inserts a podsignal_report_exports row. Returns null if Launch Evidence Graph tables are absent.
 * Preserves compatibility: base insert without JSON columns if 0017 applied but 0018 not yet.
 */
export async function insertPodsignalReportExportLineage(
  params: InsertReportExportLineageParams,
): Promise<{ id: string } | null> {
  const graphOk = await isLaunchEvidenceGraphSchemaAvailable();
  if (!graphOk) return null;

  const fullJson = await hasReportExportLineageJsonColumns();

  if (fullJson) {
    const [row] = await db
      .insert(podsignalReportExports)
      .values({
        ownerId: params.ownerId,
        episodeId: params.episodeId,
        campaignId: params.campaignId,
        reportType: params.reportType,
        exportFormat: params.exportFormat,
        exportedBy: params.exportedBy,
        evidenceScoresJson: params.evidenceScores,
        reportIdentifiersJson: params.reportIdentifiers,
      })
      .returning({ id: podsignalReportExports.id });

    return row ? { id: row.id } : null;
  }

  const client = await pool.connect();
  try {
    const res = await client.query<{ id: string }>(
      `INSERT INTO podsignal_report_exports (
        owner_id, episode_id, campaign_id, report_type, export_format, exported_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id`,
      [
        params.ownerId,
        params.episodeId,
        params.campaignId,
        params.reportType,
        params.exportFormat,
        params.exportedBy,
      ],
    );
    const id = res.rows[0]?.id;
    return id ? { id } : null;
  } finally {
    client.release();
  }
}
