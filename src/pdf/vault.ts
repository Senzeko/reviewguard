/**
 * src/pdf/vault.ts
 *
 * Evidence Vault: file storage and DB tracking for generated PDFs.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { reviewsInvestigation } from '../db/schema.js';
import { env } from '../env.js';

function getVaultRoot(): string {
  return resolve(env.EVIDENCE_VAULT_PATH);
}

export async function storePdf(
  investigationId: string,
  merchantId: string,
  caseId: string,
  pdfBytes: Uint8Array,
): Promise<string> {
  const vaultRoot = getVaultRoot();
  const merchantDir = join(vaultRoot, merchantId);

  if (!existsSync(merchantDir)) {
    mkdirSync(merchantDir, { recursive: true });
  }

  const relativePath = join(merchantId, `${caseId}.pdf`);
  const absolutePath = join(vaultRoot, relativePath);
  writeFileSync(absolutePath, pdfBytes);

  await db
    .update(reviewsInvestigation)
    .set({
      pdfPath: relativePath,
      pdfGeneratedAt: new Date(),
      caseId,
      disputeExportedAt: new Date(),
      auditLog: sql`${reviewsInvestigation.auditLog} || ${JSON.stringify([
        {
          event: 'PDF_GENERATED',
          actor: 'system',
          ts: new Date().toISOString(),
          detail: caseId,
        },
      ])}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(reviewsInvestigation.id, investigationId));

  return absolutePath;
}

export async function retrievePdf(
  investigationId: string,
): Promise<{ pdfBytes: Buffer; caseId: string; generatedAt: Date } | null> {
  const rows = await db
    .select({
      pdfPath: reviewsInvestigation.pdfPath,
      caseId: reviewsInvestigation.caseId,
      pdfGeneratedAt: reviewsInvestigation.pdfGeneratedAt,
    })
    .from(reviewsInvestigation)
    .where(eq(reviewsInvestigation.id, investigationId))
    .limit(1);

  const row = rows[0];
  if (!row?.pdfPath || !row.caseId || !row.pdfGeneratedAt) return null;

  const absolutePath = join(getVaultRoot(), row.pdfPath);
  if (!existsSync(absolutePath)) return null;

  return {
    pdfBytes: readFileSync(absolutePath),
    caseId: row.caseId,
    generatedAt: row.pdfGeneratedAt,
  };
}

export async function pdfExists(investigationId: string): Promise<boolean> {
  const rows = await db
    .select({ pdfPath: reviewsInvestigation.pdfPath })
    .from(reviewsInvestigation)
    .where(eq(reviewsInvestigation.id, investigationId))
    .limit(1);

  const row = rows[0];
  if (!row?.pdfPath) return false;

  const absolutePath = join(getVaultRoot(), row.pdfPath);
  return existsSync(absolutePath);
}
