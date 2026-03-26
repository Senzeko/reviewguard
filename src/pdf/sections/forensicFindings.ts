/**
 * src/pdf/sections/forensicFindings.ts
 *
 * Section 2: Forensic Audit Findings — factor-by-factor breakdown.
 */

import type { DrawContext } from '../layout.js';
import type { EvidencePacket } from '../index.js';
import {
  MARGIN,
  CONTENT_WIDTH,
  COLORS,
  FONT_SIZES,
  drawText,
  drawRect,
  drawBadge,
  drawLine,
  drawSectionHeader,
  checkPageBreak,
} from '../layout.js';
import type { Color } from 'pdf-lib';

function levelColor(level: string): Color {
  switch (level) {
    case 'HIGH':
      return COLORS.green;
    case 'MEDIUM':
      return COLORS.amber;
    case 'LOW':
      return COLORS.amber;
    case 'NONE':
      return COLORS.red;
    case 'NO_DATA':
      return COLORS.midGray;
    default:
      return COLORS.midGray;
  }
}

export function renderForensicFindings(
  ctx: DrawContext,
  packet: EvidencePacket,
): DrawContext {
  ctx = drawSectionHeader(ctx, '2. FORENSIC AUDIT FINDINGS');

  const providerName = packet.matchedTransaction?.posProvider ?? 'POS';
  ctx.y = drawText(
    ctx.page,
    `Data retrieved via direct API integration with POS (${providerName}).`,
    MARGIN,
    ctx.y,
    { font: ctx.fonts.regular, size: FONT_SIZES.body, color: COLORS.darkGray },
  );
  ctx.y -= 8;

  const factors: Array<{
    name: string;
    weight: string;
    pts: number;
    result: { score: number; level: string; detail: string };
    isLineItem?: boolean;
  }> = [
    {
      name: 'Identity Match',
      weight: '40%',
      pts: Math.round(packet.factorBreakdown.identity.score * 40),
      result: packet.factorBreakdown.identity,
    },
    {
      name: 'Temporal Proximity',
      weight: '30%',
      pts: Math.round(packet.factorBreakdown.temporal.score * 30),
      result: packet.factorBreakdown.temporal,
    },
    {
      name: 'Line-Item Verification',
      weight: '30%',
      pts: Math.round(packet.factorBreakdown.line_item.score * 30),
      result: packet.factorBreakdown.line_item,
      isLineItem: true,
    },
  ];

  for (const factor of factors) {
    ctx = checkPageBreak(ctx, 80);

    // Indicator dot
    const dotColor = levelColor(factor.result.level);
    ctx.page.drawCircle({
      x: MARGIN + 5,
      y: ctx.y - 2,
      size: 4,
      color: dotColor,
    });

    // Factor name
    drawText(ctx.page, factor.name, MARGIN + 16, ctx.y, {
      font: ctx.fonts.bold,
      size: FONT_SIZES.h2,
      color: COLORS.darkGray,
    });

    // Weight label (right-aligned)
    const weightStr = `${factor.weight}`;
    const weightWidth = ctx.fonts.regular.widthOfTextAtSize(weightStr, FONT_SIZES.small);
    drawText(ctx.page, weightStr, MARGIN + CONTENT_WIDTH - weightWidth - 60, ctx.y, {
      font: ctx.fonts.regular,
      size: FONT_SIZES.small,
      color: COLORS.midGray,
    });

    // Level badge
    drawBadge(
      ctx.page,
      factor.result.level,
      MARGIN + CONTENT_WIDTH - 56,
      ctx.y - 2,
      dotColor,
      ctx.fonts.bold,
    );

    ctx.y -= 18;

    // Points
    drawText(ctx.page, `${factor.pts} pts`, MARGIN + 16, ctx.y, {
      font: ctx.fonts.regular,
      size: FONT_SIZES.small,
      color: COLORS.midGray,
    });

    // AI badge for line-item
    if (factor.isLineItem && packet.llmInferenceFlag) {
      drawBadge(ctx.page, 'AI-ASSISTED INFERENCE', MARGIN + 60, ctx.y - 2, COLORS.amber, ctx.fonts.bold);
    }
    ctx.y -= 14;

    // Detail string
    ctx.y = drawText(ctx.page, factor.result.detail, MARGIN + 16, ctx.y, {
      font: ctx.fonts.regular,
      size: FONT_SIZES.body,
      color: COLORS.darkGray,
      maxWidth: CONTENT_WIDTH - 32,
    });

    // Line-item specific details
    if (factor.isLineItem && packet.llmInferenceFlag) {
      const li = packet.factorBreakdown.line_item;
      ctx.y -= 4;
      ctx.y = drawText(
        ctx.page,
        `LLM extracted: ${li.llmExtractedItems.join(', ') || 'None'}`,
        MARGIN + 16,
        ctx.y,
        { font: ctx.fonts.regular, size: 9, color: COLORS.darkGray },
      );
      ctx.y = drawText(
        ctx.page,
        `POS items: ${li.posItems.join(', ') || 'None'}`,
        MARGIN + 16,
        ctx.y,
        { font: ctx.fonts.regular, size: 9, color: COLORS.darkGray },
      );
      ctx.y = drawText(
        ctx.page,
        `Matched: ${li.matchedItems.join(', ') || 'None'}`,
        MARGIN + 16,
        ctx.y,
        { font: ctx.fonts.regular, size: 9, color: COLORS.darkGray },
      );
    }

    ctx.y -= 4;
    drawLine(ctx.page, MARGIN, ctx.y + 2, MARGIN + CONTENT_WIDTH, ctx.y + 2, {
      color: COLORS.lightGray,
    });
    ctx.y -= 8;
  }

  // ── Composite score bar ──────────────────────────────────────────────────
  ctx = checkPageBreak(ctx, 30);
  const barHeight = 8;
  const barY = ctx.y - barHeight;

  // Background bar
  drawRect(ctx.page, MARGIN, barY, CONTENT_WIDTH, barHeight, { fill: COLORS.lightGray });

  // Filled portion
  const fillWidth = (packet.confidenceScore / 100) * CONTENT_WIDTH;
  const barColor =
    packet.confidenceScore >= 75
      ? COLORS.green
      : packet.confidenceScore >= 50
        ? COLORS.amber
        : COLORS.red;
  drawRect(ctx.page, MARGIN, barY, fillWidth, barHeight, { fill: barColor });

  ctx.y = barY - 14;
  const ptsBreakdown = `(${factors[0]!.pts} + ${factors[1]!.pts} + ${factors[2]!.pts})`;
  ctx.y = drawText(
    ctx.page,
    `Composite score: ${packet.confidenceScore} / 100  ${ptsBreakdown}`,
    MARGIN,
    ctx.y,
    { font: ctx.fonts.regular, size: 9, color: COLORS.midGray },
  );
  ctx.y -= 16;

  return ctx;
}
