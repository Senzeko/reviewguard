/**
 * src/pdf/sections/incidentOverview.ts
 *
 * Section 1: Incident Overview — reviewer details + matched POS transaction.
 */
import { MARGIN, CONTENT_WIDTH, COLORS, FONT_SIZES, drawText, drawRect, drawSectionHeader, checkPageBreak, formatDateTime, formatCents, } from '../layout.js';
function drawField(ctx, label, value, x, y, maxWidth) {
    drawText(ctx.page, label, x, y, {
        font: ctx.fonts.bold,
        size: FONT_SIZES.small,
        color: COLORS.midGray,
    });
    return drawText(ctx.page, value, x + 100, y, {
        font: ctx.fonts.regular,
        size: FONT_SIZES.body,
        color: COLORS.darkGray,
        maxWidth: maxWidth - 100,
    });
}
export function renderIncidentOverview(ctx, packet) {
    ctx = drawSectionHeader(ctx, '1. INCIDENT OVERVIEW');
    const colWidth = (CONTENT_WIDTH - 12) / 2;
    const leftX = MARGIN;
    const rightX = MARGIN + colWidth + 12;
    // ── Left column: Google Review ──────────────────────────────────────────
    let leftY = ctx.y;
    leftY = drawText(ctx.page, 'Google Review', leftX, leftY, {
        font: ctx.fonts.bold,
        size: FONT_SIZES.h2,
        color: COLORS.blue,
    });
    leftY -= 4;
    leftY = drawField(ctx, 'Reviewer name:', packet.reviewerDisplayName, leftX, leftY, colWidth);
    leftY = drawField(ctx, 'Review date:', formatDateTime(packet.reviewPublishedAt), leftX, leftY, colWidth);
    leftY = drawField(ctx, 'Star rating:', `${packet.reviewRating} / 5`, leftX, leftY, colWidth);
    leftY = drawField(ctx, 'Alleged violation:', 'Content not representing a genuine experience', leftX, leftY, colWidth);
    leftY -= 8;
    // Review text block
    ctx = checkPageBreak(ctx, 60);
    const reviewBlockWidth = CONTENT_WIDTH;
    drawRect(ctx.page, leftX, leftY - 60, reviewBlockWidth, 60, {
        fill: COLORS.offWhite,
        border: COLORS.lightGray,
        borderWidth: 1,
    });
    leftY = drawText(ctx.page, `"${packet.reviewText}"`, leftX + 8, leftY - 12, {
        font: ctx.fonts.italic,
        size: FONT_SIZES.body,
        color: COLORS.darkGray,
        maxWidth: reviewBlockWidth - 16,
    });
    leftY -= 16;
    // ── Right column: Matched POS Transaction ────────────────────────────────
    let rightY = ctx.y;
    if (packet.matchedTransaction) {
        const txn = packet.matchedTransaction;
        rightY = drawText(ctx.page, 'Matched POS Transaction', rightX, rightY, {
            font: ctx.fonts.bold,
            size: FONT_SIZES.h2,
            color: COLORS.blue,
        });
        rightY -= 4;
        rightY = drawField(ctx, 'Transaction ID:', txn.posTransactionId, rightX, rightY, colWidth);
        rightY = drawField(ctx, 'POS provider:', txn.posProvider, rightX, rightY, colWidth);
        const custName = packet.factorBreakdown.identity.customerName ?? 'Expired \u2014 hash only';
        rightY = drawField(ctx, 'Customer name:', custName, rightX, rightY, colWidth);
        rightY = drawField(ctx, 'Transaction date:', formatDateTime(txn.closedAt), rightX, rightY, colWidth);
        rightY = drawField(ctx, 'Total:', formatCents(txn.transactionAmountCents), rightX, rightY, colWidth);
        rightY -= 8;
        // Line items table
        rightY = drawText(ctx.page, 'Item', rightX, rightY, {
            font: ctx.fonts.bold,
            size: FONT_SIZES.small,
            color: COLORS.midGray,
        });
        drawText(ctx.page, 'Qty', rightX + colWidth - 70, rightY + 12, {
            font: ctx.fonts.bold,
            size: FONT_SIZES.small,
            color: COLORS.midGray,
        });
        drawText(ctx.page, 'Price', rightX + colWidth - 36, rightY + 12, {
            font: ctx.fonts.bold,
            size: FONT_SIZES.small,
            color: COLORS.midGray,
        });
        rightY -= 4;
        for (let i = 0; i < txn.lineItems.length; i++) {
            const item = txn.lineItems[i];
            if (i % 2 === 0) {
                drawRect(ctx.page, rightX, rightY - 2, colWidth, 14, {
                    fill: COLORS.offWhite,
                });
            }
            drawText(ctx.page, item.name, rightX + 2, rightY, {
                font: ctx.fonts.regular,
                size: FONT_SIZES.body,
                color: COLORS.darkGray,
            });
            drawText(ctx.page, String(item.quantity), rightX + colWidth - 70, rightY, {
                font: ctx.fonts.regular,
                size: FONT_SIZES.body,
                color: COLORS.darkGray,
            });
            drawText(ctx.page, formatCents(item.price_cents), rightX + colWidth - 36, rightY, {
                font: ctx.fonts.regular,
                size: FONT_SIZES.body,
                color: COLORS.darkGray,
            });
            rightY -= 14;
        }
    }
    else {
        rightY = drawText(ctx.page, 'No Record Found', rightX, rightY, {
            font: ctx.fonts.bold,
            size: FONT_SIZES.h2,
            color: COLORS.midGray,
        });
        rightY -= 4;
        rightY = drawText(ctx.page, 'No matching transaction found within the 14-day window.', rightX, rightY, {
            font: ctx.fonts.regular,
            size: FONT_SIZES.body,
            color: COLORS.midGray,
            maxWidth: colWidth,
        });
    }
    ctx.y = Math.min(leftY, rightY) - 16;
    return ctx;
}
//# sourceMappingURL=incidentOverview.js.map