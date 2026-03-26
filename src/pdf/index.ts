/**
 * src/pdf/index.ts
 *
 * Evidence Packet assembly and PDF generation.
 * Main exports: assembleEvidencePacket() and generateDisputePacket().
 */

import { PDFDocument } from 'pdf-lib';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  reviewsInvestigation,
  merchants,
  transactionsVault,
} from '../db/schema.js';
import type { LineItem } from '../db/schema.js';
import {
  embedFonts,
  newPage,
  MARGIN,
  CONTENT_WIDTH,
  COLORS,
  FONT_SIZES,
  drawText,
  drawLine,
} from './layout.js';
import { renderCoverPage } from './sections/coverPage.js';
import { renderIncidentOverview } from './sections/incidentOverview.js';
import { renderForensicFindings } from './sections/forensicFindings.js';
import { renderDiscrepancyLog } from './sections/discrepancyLog.js';
import { renderTimestampAudit } from './sections/timestampAudit.js';
import { renderMerchantStatement } from './sections/merchantStatement.js';

// ── EvidencePacket type ──────────────────────────────────────────────────────

export interface EvidencePacket {
  caseId: string;
  generatedAt: Date;
  merchantBusinessName: string;
  merchantGooglePlaceId: string;
  reviewId: string;
  googleReviewId: string;
  reviewerDisplayName: string;
  reviewText: string;
  reviewRating: number;
  reviewPublishedAt: Date;
  matchedTransaction: {
    posTransactionId: string;
    posProvider: 'SQUARE' | 'CLOVER';
    closedAt: Date;
    lineItems: Array<{ name: string; quantity: number; price_cents: number }>;
    transactionAmountCents: number;
  } | null;
  confidenceScore: number;
  matchStatus: 'VERIFIED' | 'MISMATCH' | 'NO_RECORD';
  llmInferenceFlag: boolean;
  factorBreakdown: {
    identity: {
      score: number;
      level: string;
      detail: string;
      jaroWinklerScore: number;
      reviewerName: string;
      customerName: string | null;
      nameWindowExpired: boolean;
    };
    temporal: {
      score: number;
      level: string;
      detail: string;
      deltaHours: number;
      reviewPublishedAt: string;
      transactionClosedAt: string;
    };
    line_item: {
      score: number;
      level: string;
      detail: string;
      llmExtractedItems: string[];
      matchedItems: string[];
      posItems: string[];
      llmRawResponse: string;
    };
  };
  humanReviewedAt: Date | null;
  humanReviewerId: string | null;
}

// ── Case ID generation ───────────────────────────────────────────────────────

export function generateCaseId(
  reviewPublishedAt: Date,
  posTransactionId: string | null,
): string {
  const date = reviewPublishedAt.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = posTransactionId
    ? posTransactionId.slice(-4).toUpperCase()
    : Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RG-${date}-${suffix}`;
}

// ── Data assembly ────────────────────────────────────────────────────────────

export async function assembleEvidencePacket(
  investigationId: string,
): Promise<EvidencePacket> {
  const review = await db
    .select()
    .from(reviewsInvestigation)
    .where(eq(reviewsInvestigation.id, investigationId))
    .limit(1);

  const row = review[0];
  if (!row) throw new Error(`Investigation ${investigationId} not found`);

  if (row.matchStatus === 'PENDING' || row.matchStatus === 'PROCESSING') {
    throw new Error(
      `Cannot generate PDF — review ${investigationId} not yet scored (status: ${row.matchStatus})`,
    );
  }

  const merchant = await db
    .select()
    .from(merchants)
    .where(eq(merchants.id, row.merchantId))
    .limit(1);
  const m = merchant[0];
  if (!m) throw new Error(`Merchant ${row.merchantId} not found`);

  let matchedTxn: EvidencePacket['matchedTransaction'] = null;
  if (row.matchedTransactionId) {
    const txn = await db
      .select()
      .from(transactionsVault)
      .where(eq(transactionsVault.id, row.matchedTransactionId))
      .limit(1);
    const t = txn[0];
    if (t) {
      matchedTxn = {
        posTransactionId: t.posTransactionId,
        posProvider: t.posProvider,
        closedAt: t.closedAt,
        lineItems: t.lineItems as LineItem[],
        transactionAmountCents: t.transactionAmountCents,
      };
    }
  }

  // Factor breakdown is stored as snake_case JSONB — normalize to camelCase
  const rawFb = row.factorBreakdown as Record<string, any> | null;
  let fb: EvidencePacket['factorBreakdown'] | null = null;
  if (rawFb) {
    const rawId = rawFb.identity ?? {};
    const rawTe = rawFb.temporal ?? {};
    const rawLi = rawFb.line_item ?? {};
    fb = {
      identity: {
        score: rawId.score ?? 0,
        level: rawId.level ?? 'NONE',
        detail: rawId.detail ?? 'No data',
        jaroWinklerScore: rawId.jaro_winkler_score ?? rawId.jaroWinklerScore ?? 0,
        reviewerName: rawId.reviewer_name ?? rawId.reviewerName ?? row.reviewerDisplayName,
        customerName: rawId.customer_name ?? rawId.customerName ?? null,
        nameWindowExpired: rawId.name_window_expired ?? rawId.nameWindowExpired ?? false,
      },
      temporal: {
        score: rawTe.score ?? 0,
        level: rawTe.level ?? 'NONE',
        detail: rawTe.detail ?? 'No data',
        deltaHours: rawTe.delta_hours ?? rawTe.deltaHours ?? 0,
        reviewPublishedAt: rawTe.review_published_at ?? rawTe.reviewPublishedAt ?? row.reviewPublishedAt.toISOString(),
        transactionClosedAt: rawTe.transaction_closed_at ?? rawTe.transactionClosedAt ?? '',
      },
      line_item: {
        score: rawLi.score ?? 0,
        level: rawLi.level ?? 'NONE',
        detail: rawLi.detail ?? 'No data',
        llmExtractedItems: rawLi.llm_extracted_items ?? rawLi.llmExtractedItems ?? [],
        matchedItems: rawLi.matched_items ?? rawLi.matchedItems ?? [],
        posItems: rawLi.pos_items ?? rawLi.posItems ?? [],
        llmRawResponse: rawLi.llm_raw_response ?? rawLi.llmRawResponse ?? '',
      },
    };
  }
  const defaultFb: EvidencePacket['factorBreakdown'] = {
    identity: {
      score: 0, level: 'NONE', detail: 'No data', jaroWinklerScore: 0,
      reviewerName: row.reviewerDisplayName, customerName: null, nameWindowExpired: false,
    },
    temporal: {
      score: 0, level: 'NONE', detail: 'No data', deltaHours: 0,
      reviewPublishedAt: row.reviewPublishedAt.toISOString(), transactionClosedAt: '',
    },
    line_item: {
      score: 0, level: 'NONE', detail: 'No data', llmExtractedItems: [],
      matchedItems: [], posItems: [], llmRawResponse: '',
    },
  };

  const caseId = row.caseId ?? generateCaseId(
    row.reviewPublishedAt,
    matchedTxn?.posTransactionId ?? null,
  );

  return {
    caseId,
    generatedAt: new Date(),
    merchantBusinessName: m.businessName,
    merchantGooglePlaceId: m.googlePlaceId,
    reviewId: row.id,
    googleReviewId: row.googleReviewId,
    reviewerDisplayName: row.reviewerDisplayName,
    reviewText: row.reviewText,
    reviewRating: row.reviewRating,
    reviewPublishedAt: row.reviewPublishedAt,
    matchedTransaction: matchedTxn,
    confidenceScore: row.confidenceScore ?? 0,
    matchStatus: row.matchStatus as 'VERIFIED' | 'MISMATCH' | 'NO_RECORD',
    llmInferenceFlag: row.llmInferenceFlag,
    factorBreakdown: fb ?? defaultFb,
    humanReviewedAt: row.humanReviewedAt,
    humanReviewerId: row.humanReviewerId,
  };
}

// ── PDF generation ───────────────────────────────────────────────────────────

export async function generateDisputePacket(
  investigationId: string,
): Promise<{ pdfBytes: Uint8Array; caseId: string }> {
  const packet = await assembleEvidencePacket(investigationId);
  const doc = await PDFDocument.create();

  doc.setTitle(`ReviewGuard AI \u2014 Case ${packet.caseId}`);
  doc.setSubject('Forensic Reputation Audit');
  doc.setProducer('ReviewGuard AI');

  const fonts = await embedFonts(doc);
  let ctx = newPage(doc, fonts);

  // Render sections in order
  ctx = renderCoverPage(ctx, packet);
  ctx = renderIncidentOverview(ctx, packet);
  ctx = renderForensicFindings(ctx, packet);
  ctx = renderDiscrepancyLog(ctx, packet);
  ctx = renderTimestampAudit(ctx, packet);
  ctx = renderMerchantStatement(ctx, packet);

  // ── Footer on every page (two-pass) ──────────────────────────────────────
  const pages = doc.getPages();
  const totalPages = pages.length;
  for (let i = 0; i < totalPages; i++) {
    const page = pages[i]!;
    const footerY = 28;

    drawLine(page, MARGIN, footerY + 10, MARGIN + CONTENT_WIDTH, footerY + 10, {
      color: COLORS.lightGray,
    });

    drawText(
      page,
      `ReviewGuard AI \u00B7 Case ${packet.caseId}`,
      MARGIN,
      footerY,
      { font: fonts.regular, size: FONT_SIZES.tiny, color: COLORS.midGray },
    );

    const centerText = 'CONFIDENTIAL \u2014 FOR GOOGLE APPEAL USE ONLY';
    const centerWidth = fonts.regular.widthOfTextAtSize(centerText, FONT_SIZES.tiny);
    drawText(
      page,
      centerText,
      MARGIN + (CONTENT_WIDTH - centerWidth) / 2,
      footerY,
      { font: fonts.regular, size: FONT_SIZES.tiny, color: COLORS.midGray },
    );

    const pageText = `Page ${i + 1} of ${totalPages}`;
    const pageWidth = fonts.regular.widthOfTextAtSize(pageText, FONT_SIZES.tiny);
    drawText(
      page,
      pageText,
      MARGIN + CONTENT_WIDTH - pageWidth,
      footerY,
      { font: fonts.regular, size: FONT_SIZES.tiny, color: COLORS.midGray },
    );
  }

  const pdfBytes = await doc.save();
  return { pdfBytes, caseId: packet.caseId };
}
