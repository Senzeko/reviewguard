/**
 * src/pdf/sections/discrepancyLog.ts
 *
 * Section 3: Discrepancy Log — item contradictions between review and POS.
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
  drawSectionHeader,
  checkPageBreak,
  wrapText,
  formatDateTime,
} from '../layout.js';

export function renderDiscrepancyLog(
  ctx: DrawContext,
  packet: EvidencePacket,
): DrawContext {
  ctx = drawSectionHeader(ctx, '3. DISCREPANCY LOG');

  const li = packet.factorBreakdown.line_item;

  if (!packet.matchedTransaction) {
    // NO_RECORD case
    ctx = checkPageBreak(ctx, 60);
    const msg =
      `No matching transaction found within the 14-day window surrounding ` +
      `the review timestamp (${formatDateTime(packet.reviewPublishedAt)}). ` +
      `A search of all transactions for ${packet.merchantBusinessName} found no ` +
      `customer record matching '${packet.reviewerDisplayName}' in this period.`;
    const lines = wrapText(msg, ctx.fonts.regular, FONT_SIZES.body, CONTENT_WIDTH - 20);
    const blockHeight = lines.length * 14 + 16;

    drawRect(ctx.page, MARGIN, ctx.y - blockHeight + 14, CONTENT_WIDTH, blockHeight, {
      fill: COLORS.offWhite,
    });
    drawRect(ctx.page, MARGIN, ctx.y - blockHeight + 14, 3, blockHeight, {
      fill: COLORS.midGray,
    });
    ctx.y = drawText(ctx.page, msg, MARGIN + 12, ctx.y, {
      font: ctx.fonts.regular,
      size: FONT_SIZES.body,
      color: COLORS.darkGray,
      maxWidth: CONTENT_WIDTH - 24,
    });
    ctx.y -= 12;
  } else {
    // Find items mentioned in review but NOT matched
    const discrepancies = li.llmExtractedItems.filter(
      (item) => !li.matchedItems.some((m) => m.toLowerCase() === item.toLowerCase()),
    );

    if (discrepancies.length === 0) {
      // All items matched
      ctx = checkPageBreak(ctx, 30);
      ctx.y = drawText(
        ctx.page,
        'No item discrepancies detected. All mentioned items appear in POS records.',
        MARGIN,
        ctx.y,
        { font: ctx.fonts.regular, size: FONT_SIZES.body, color: COLORS.green },
      );
      ctx.y -= 12;
    } else {
      // One entry per discrepancy
      for (const item of discrepancies) {
        ctx = checkPageBreak(ctx, 70);
        const bodyMsg =
          `Review mentions "${item}". Transaction ${packet.matchedTransaction.posTransactionId} ` +
          `contains only ${li.posItems.join(', ')}. A search of the 72-hour window found zero ` +
          `${item} sales at this location.`;
        const bodyLines = wrapText(bodyMsg, ctx.fonts.regular, FONT_SIZES.body, CONTENT_WIDTH - 28);
        const entryHeight = 20 + bodyLines.length * 14 + 8;

        drawRect(ctx.page, MARGIN, ctx.y - entryHeight + 14, CONTENT_WIDTH, entryHeight, {
          fill: COLORS.offWhite,
        });
        // Red left border
        drawRect(ctx.page, MARGIN, ctx.y - entryHeight + 14, 3, entryHeight, {
          fill: COLORS.red,
        });

        // Title row
        drawText(ctx.page, 'Item discrepancy', MARGIN + 12, ctx.y, {
          font: ctx.fonts.bold,
          size: FONT_SIZES.body,
          color: COLORS.red,
        });
        if (packet.llmInferenceFlag) {
          drawBadge(ctx.page, 'AI-INFERRED', MARGIN + 120, ctx.y - 2, COLORS.amber, ctx.fonts.bold);
        }
        ctx.y -= 16;

        ctx.y = drawText(ctx.page, bodyMsg, MARGIN + 12, ctx.y, {
          font: ctx.fonts.regular,
          size: FONT_SIZES.body,
          color: COLORS.darkGray,
          maxWidth: CONTENT_WIDTH - 28,
        });
        ctx.y -= 12;
      }
    }

    // Temporal note
    const temporal = packet.factorBreakdown.temporal;
    if (temporal.level !== 'HIGH') {
      ctx = checkPageBreak(ctx, 50);
      const noteLines = wrapText(temporal.detail, ctx.fonts.regular, FONT_SIZES.body, CONTENT_WIDTH - 24);
      const noteHeight = 20 + noteLines.length * 14 + 8;

      drawRect(ctx.page, MARGIN, ctx.y - noteHeight + 14, CONTENT_WIDTH, noteHeight, {
        fill: COLORS.offWhite,
      });
      drawRect(ctx.page, MARGIN, ctx.y - noteHeight + 14, 3, noteHeight, {
        fill: COLORS.amber,
      });
      drawText(ctx.page, 'Temporal note', MARGIN + 12, ctx.y, {
        font: ctx.fonts.bold,
        size: FONT_SIZES.body,
        color: COLORS.amber,
      });
      ctx.y -= 16;
      ctx.y = drawText(ctx.page, temporal.detail, MARGIN + 12, ctx.y, {
        font: ctx.fonts.regular,
        size: FONT_SIZES.body,
        color: COLORS.darkGray,
        maxWidth: CONTENT_WIDTH - 24,
      });
      ctx.y -= 12;
    }
  }

  ctx.y -= 8;
  return ctx;
}
