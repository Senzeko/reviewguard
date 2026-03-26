/**
 * src/pdf/sections/timestampAudit.ts
 *
 * Section 4: Timestamp Audit — vertical timeline visualization.
 */
import { MARGIN, CONTENT_WIDTH, COLORS, FONT_SIZES, drawText, drawSectionHeader, checkPageBreak, formatDateTime, formatCents, } from '../layout.js';
export function renderTimestampAudit(ctx, packet) {
    ctx = drawSectionHeader(ctx, '4. TIMESTAMP AUDIT');
    ctx = checkPageBreak(ctx, 160);
    const lineX = MARGIN + 12;
    const textX = MARGIN + 28;
    const textMaxW = CONTENT_WIDTH - 40;
    if (!packet.matchedTransaction) {
        // Single red node — no matching transaction
        ctx.page.drawCircle({
            x: lineX,
            y: ctx.y - 2,
            size: 5,
            color: COLORS.red,
        });
        ctx.y = drawText(ctx.page, 'No matching transaction found in 14-day window', textX, ctx.y, {
            font: ctx.fonts.bold,
            size: FONT_SIZES.body,
            color: COLORS.red,
            maxWidth: textMaxW,
        });
        ctx.y -= 20;
    }
    else {
        const txn = packet.matchedTransaction;
        const temporal = packet.factorBreakdown.temporal;
        // Event 1 — POS transaction (green dot)
        const event1Y = ctx.y;
        ctx.page.drawCircle({
            x: lineX,
            y: event1Y - 2,
            size: 5,
            color: COLORS.green,
        });
        drawText(ctx.page, formatDateTime(txn.closedAt), textX, event1Y, {
            font: ctx.fonts.bold,
            size: FONT_SIZES.body,
            color: COLORS.darkGray,
        });
        drawText(ctx.page, `POS transaction closed \u2014 ${txn.posTransactionId}`, textX, event1Y - 14, { font: ctx.fonts.regular, size: FONT_SIZES.body, color: COLORS.darkGray });
        drawText(ctx.page, `${txn.posProvider} \u00B7 ${formatCents(txn.transactionAmountCents)}`, textX, event1Y - 28, { font: ctx.fonts.regular, size: FONT_SIZES.small, color: COLORS.midGray });
        const gapStartY = event1Y - 42;
        // Vertical line
        ctx.page.drawLine({
            start: { x: lineX, y: gapStartY },
            end: { x: lineX, y: gapStartY - 30 },
            color: COLORS.lightGray,
            thickness: 1,
        });
        // Gap label
        const deltaHours = temporal.deltaHours;
        const gapLabel = deltaHours >= 48
            ? `${(deltaHours / 24).toFixed(1)} days`
            : `${deltaHours.toFixed(1)} hours`;
        drawText(ctx.page, `\u2190\u2192 ${gapLabel}`, textX, gapStartY - 12, {
            font: ctx.fonts.regular,
            size: FONT_SIZES.small,
            color: COLORS.midGray,
        });
        const event2Y = gapStartY - 40;
        // Event 2 — Review published (amber/red dot)
        const reviewDotColor = temporal.level === 'HIGH'
            ? COLORS.green
            : temporal.level === 'MEDIUM'
                ? COLORS.amber
                : COLORS.red;
        ctx.page.drawCircle({
            x: lineX,
            y: event2Y - 2,
            size: 5,
            color: reviewDotColor,
        });
        drawText(ctx.page, formatDateTime(packet.reviewPublishedAt), textX, event2Y, {
            font: ctx.fonts.bold,
            size: FONT_SIZES.body,
            color: COLORS.darkGray,
        });
        drawText(ctx.page, 'Google review published', textX, event2Y - 14, {
            font: ctx.fonts.regular,
            size: FONT_SIZES.body,
            color: COLORS.darkGray,
        });
        drawText(ctx.page, `${packet.reviewerDisplayName} \u00B7 ${packet.reviewRating} stars`, textX, event2Y - 28, { font: ctx.fonts.regular, size: FONT_SIZES.small, color: COLORS.midGray });
        ctx.y = event2Y - 46;
        // Window searched info
        const txnDate = new Date(txn.closedAt);
        const windowStart = new Date(txnDate.getTime() - 14 * 24 * 60 * 60 * 1000);
        const windowEnd = new Date(txnDate.getTime() + 1 * 24 * 60 * 60 * 1000);
        ctx.y = drawText(ctx.page, `Window searched: ${formatDateTime(windowStart)} to ${formatDateTime(windowEnd)}`, MARGIN, ctx.y, { font: ctx.fonts.regular, size: FONT_SIZES.small, color: COLORS.midGray });
        ctx.y = drawText(ctx.page, 'Transactions found in window: 1', MARGIN, ctx.y, { font: ctx.fonts.regular, size: FONT_SIZES.small, color: COLORS.midGray });
    }
    ctx.y -= 16;
    return ctx;
}
//# sourceMappingURL=timestampAudit.js.map