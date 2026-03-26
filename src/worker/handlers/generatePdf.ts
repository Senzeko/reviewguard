/**
 * src/worker/handlers/generatePdf.ts
 *
 * Handles GENERATE_DISPUTE_PDF jobs — generates the evidence PDF and stores it.
 */

import { eq } from 'drizzle-orm';
import type { GenerateDisputePdfJob } from '../../queue/jobs.js';
import { generateDisputePacket } from '../../pdf/index.js';
import { storePdf, pdfExists } from '../../pdf/vault.js';
import { db } from '../../db/index.js';
import { reviewsInvestigation } from '../../db/schema.js';
import { onPdfGenerated } from '../../email/notify.js';

export async function handleGeneratePdf(
  job: GenerateDisputePdfJob,
): Promise<void> {
  const { investigationId, merchantId } = job;

  // Idempotency guard
  if (await pdfExists(investigationId)) {
    console.log(`[pdf] PDF already exists for ${investigationId} — skipping`);
    return;
  }

  // Check match_status is scoreable
  const rows = await db
    .select({ matchStatus: reviewsInvestigation.matchStatus })
    .from(reviewsInvestigation)
    .where(eq(reviewsInvestigation.id, investigationId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    console.error(`[pdf] Investigation ${investigationId} not found`);
    return;
  }

  if (row.matchStatus === 'PENDING' || row.matchStatus === 'PROCESSING') {
    console.warn(
      `[pdf] Cannot generate PDF — review ${investigationId} not yet scored (status: ${row.matchStatus})`,
    );
    return;
  }

  try {
    const { pdfBytes, caseId } = await generateDisputePacket(investigationId);
    await storePdf(investigationId, merchantId, caseId, pdfBytes);
    console.log(
      `[pdf] Generated dispute packet ${caseId} for review ${investigationId}`,
    );

    // Email notification (fire-and-forget)
    void onPdfGenerated({
      merchantId,
      investigationId,
      caseId,
    });
  } catch (err) {
    console.error(`[pdf] Failed to generate PDF for ${investigationId}:`, err);
    throw err;
  }
}
