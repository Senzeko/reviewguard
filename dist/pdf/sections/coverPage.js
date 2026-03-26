/**
 * src/pdf/sections/coverPage.ts
 *
 * Cover page: branded header, case ID, score summary, AI inference warning.
 */
import { MARGIN, CONTENT_WIDTH, COLORS, FONT_SIZES, drawText, drawRect, drawBadge, drawLine, formatDate, wrapText, } from '../layout.js';
export function renderCoverPage(ctx, packet) {
    // ── Navy header rectangle ────────────────────────────────────────────────
    const headerHeight = 72;
    const headerY = ctx.y - headerHeight + 14;
    drawRect(ctx.page, MARGIN, headerY, CONTENT_WIDTH, headerHeight, {
        fill: COLORS.navy,
    });
    drawText(ctx.page, 'ReviewGuard AI', MARGIN + 8, headerY + headerHeight - 24, {
        font: ctx.fonts.bold,
        size: 18,
        color: COLORS.white,
    });
    drawText(ctx.page, 'Forensic Reputation Audit', MARGIN + 8, headerY + headerHeight - 40, {
        font: ctx.fonts.regular,
        size: FONT_SIZES.h2,
        color: COLORS.white,
    });
    ctx.y = headerY - 16;
    // ── Title line ───────────────────────────────────────────────────────────
    ctx.y = drawText(ctx.page, 'REPUTATION AUDIT: EVIDENCE OF POLICY VIOLATION', MARGIN, ctx.y, { font: ctx.fonts.bold, size: FONT_SIZES.h1, color: COLORS.navy });
    drawLine(ctx.page, MARGIN, ctx.y + 6, MARGIN + CONTENT_WIDTH, ctx.y + 6, {
        color: COLORS.navy,
        thickness: 1,
    });
    ctx.y -= 4;
    // ── Case ID + date ──────────────────────────────────────────────────────
    drawText(ctx.page, `Case ID:  ${packet.caseId}`, MARGIN, ctx.y, {
        font: ctx.fonts.regular,
        size: FONT_SIZES.body,
        color: COLORS.darkGray,
    });
    const dateStr = formatDate(packet.generatedAt);
    const dateWidth = ctx.fonts.regular.widthOfTextAtSize(dateStr, FONT_SIZES.body);
    drawText(ctx.page, dateStr, MARGIN + CONTENT_WIDTH - dateWidth, ctx.y, {
        font: ctx.fonts.regular,
        size: FONT_SIZES.body,
        color: COLORS.midGray,
    });
    ctx.y -= 14;
    drawText(ctx.page, `Date:     ${formatDate(packet.generatedAt)}`, MARGIN, ctx.y, {
        font: ctx.fonts.regular,
        size: FONT_SIZES.body,
        color: COLORS.darkGray,
    });
    ctx.y -= 20;
    // ── Score summary block ─────────────────────────────────────────────────
    const summaryHeight = 56;
    drawRect(ctx.page, MARGIN, ctx.y - summaryHeight + 14, CONTENT_WIDTH, summaryHeight, {
        fill: COLORS.offWhite,
    });
    const blockY = ctx.y;
    const colWidth = CONTENT_WIDTH / 3;
    // Left column — score
    drawText(ctx.page, 'Confidence score', MARGIN + 8, blockY, {
        font: ctx.fonts.regular,
        size: FONT_SIZES.small,
        color: COLORS.midGray,
    });
    drawText(ctx.page, `${packet.confidenceScore} / 100`, MARGIN + 8, blockY - 18, {
        font: ctx.fonts.bold,
        size: FONT_SIZES.title,
        color: COLORS.navy,
    });
    // Center column — match status
    const centerX = MARGIN + colWidth + 8;
    drawText(ctx.page, 'Match status', centerX, blockY, {
        font: ctx.fonts.regular,
        size: FONT_SIZES.small,
        color: COLORS.midGray,
    });
    const statusColor = packet.matchStatus === 'VERIFIED'
        ? COLORS.green
        : packet.matchStatus === 'MISMATCH'
            ? COLORS.red
            : COLORS.midGray;
    drawBadge(ctx.page, packet.matchStatus, centerX, blockY - 18, statusColor, ctx.fonts.bold);
    // Right column — AI inference
    const rightX = MARGIN + colWidth * 2 + 8;
    drawText(ctx.page, 'AI inference', rightX, blockY, {
        font: ctx.fonts.regular,
        size: FONT_SIZES.small,
        color: COLORS.midGray,
    });
    if (packet.llmInferenceFlag) {
        drawBadge(ctx.page, 'ACTIVE', rightX, blockY - 18, COLORS.amber, ctx.fonts.bold);
    }
    else {
        drawBadge(ctx.page, 'NONE', rightX, blockY - 18, COLORS.green, ctx.fonts.bold);
    }
    ctx.y -= summaryHeight + 8;
    // ── AI inference warning ────────────────────────────────────────────────
    if (packet.llmInferenceFlag) {
        const warningText = 'One or more findings in this report were generated using LLM-based ' +
            'entity extraction. These findings are labeled throughout and must be ' +
            'independently verified before submission to Google.';
        const warningLines = wrapText(warningText, ctx.fonts.regular, FONT_SIZES.body, CONTENT_WIDTH - 24);
        const warningHeight = 24 + warningLines.length * 14;
        drawRect(ctx.page, MARGIN, ctx.y - warningHeight + 14, CONTENT_WIDTH, warningHeight, {
            fill: COLORS.offWhite,
        });
        // Amber left border
        drawRect(ctx.page, MARGIN, ctx.y - warningHeight + 14, 3, warningHeight, {
            fill: COLORS.amber,
        });
        drawText(ctx.page, 'AI-Assisted Inference Active', MARGIN + 12, ctx.y, {
            font: ctx.fonts.bold,
            size: FONT_SIZES.body,
            color: COLORS.amber,
        });
        ctx.y -= 16;
        ctx.y = drawText(ctx.page, warningText, MARGIN + 12, ctx.y, {
            font: ctx.fonts.regular,
            size: FONT_SIZES.body,
            color: COLORS.darkGray,
            maxWidth: CONTENT_WIDTH - 24,
        });
        ctx.y -= 8;
    }
    ctx.y -= 12;
    return ctx;
}
//# sourceMappingURL=coverPage.js.map