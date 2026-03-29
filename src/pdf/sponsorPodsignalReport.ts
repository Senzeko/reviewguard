/**
 * PodSignal sponsor / launch proof PDF — honest, PodSignal-observed metrics only.
 */

import { PDFDocument } from 'pdf-lib';
import type { PodsignalReportSummary } from '../podsignal/reportSummaryData.js';
import {
  COLORS,
  CONTENT_WIDTH,
  FONT_SIZES,
  MARGIN,
  checkPageBreak,
  drawLine,
  drawText,
  embedFonts,
  newPage,
  sanitizeForPdf,
  type DrawContext,
} from './layout.js';

function paragraph(
  ctx: DrawContext,
  text: string,
  opts: { bold?: boolean; size?: number } = {},
): DrawContext {
  const font = opts.bold ? ctx.fonts.bold : ctx.fonts.regular;
  const size = opts.size ?? FONT_SIZES.body;
  const lineHeight = size * 1.45;
  const safe = sanitizeForPdf(text);
  ctx = checkPageBreak(ctx, Math.min(120, safe.length / 3));
  const endY = drawText(ctx.page, safe, MARGIN, ctx.y, {
    font,
    size,
    color: COLORS.darkGray,
    maxWidth: CONTENT_WIDTH,
  });
  ctx = { ...ctx, y: endY - lineHeight * 0.5 };
  return ctx;
}

export async function generateSponsorPodsignalPdf(summary: PodsignalReportSummary): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts = await embedFonts(doc);
  let ctx = newPage(doc, fonts);

  ctx.y = drawText(ctx.page, 'PodSignal — Launch & sponsor proof', MARGIN, ctx.y, {
    font: fonts.bold,
    size: FONT_SIZES.title,
    color: COLORS.navy,
    maxWidth: CONTENT_WIDTH,
  });
  ctx.y -= 8;
  ctx = paragraph(ctx, 'Closed beta · PodSignal-observed events only · not host-platform analytics', {
    size: FONT_SIZES.small,
  });
  ctx = paragraph(ctx, `Generated (UTC): ${summary.generatedAt}  |  Rolling window: ${summary.windowDays} days`, {
    size: FONT_SIZES.small,
  });

  drawLine(ctx.page, MARGIN, ctx.y + 4, MARGIN + CONTENT_WIDTH, ctx.y + 4, { color: COLORS.lightGray });
  ctx.y -= 16;

  ctx = paragraph(ctx, 'EXECUTIVE SUMMARY', { bold: true, size: FONT_SIZES.h1 });
  ctx = paragraph(ctx, summary.narrative.headline, { bold: true });
  ctx = paragraph(ctx, summary.narrative.body);

  ctx = paragraph(ctx, 'KEY METRICS (OBSERVED)', { bold: true, size: FONT_SIZES.h1 });
  ctx = paragraph(
    ctx,
    [
      `Short-link redirect hits: ${summary.trackableLinkClicksObserved}`,
      `In-app usage events: ${summary.outputUsageEventTotal}`,
      `Launch pack approvals: ${summary.launchPackApprovalsObserved}`,
      `Shows: ${summary.workspace.shows}  |  Active campaigns: ${summary.workspace.activeCampaigns}`,
      `Checklist tasks done / total: ${summary.workspace.launchTasksDone} / ${summary.workspace.launchTasksTotal}`,
    ].join('\n'),
  );

  const es = summary.evidenceScores;
  ctx = paragraph(
    ctx,
    [
      'EVIDENCE GRAPH SCORES (0–100, deterministic composites — not predictions):',
      `Observed activation: ${es.observedActivation}  |  Launch execution: ${es.launchExecution}  |  Sponsor-proof strength: ${es.sponsorProofStrength}`,
    ].join('\n'),
    { size: FONT_SIZES.small },
  );

  ctx = paragraph(ctx, 'CLICKS BY EPISODE (TOP)', { bold: true, size: FONT_SIZES.h1 });
  if (summary.clicksByEpisode.length === 0) {
    ctx = paragraph(ctx, 'No redirect hits in this window yet.');
  } else {
    for (const row of summary.clicksByEpisode) {
      ctx = paragraph(ctx, `${row.episodeTitle}: ${row.clicks} hits [${row.evidence}]`);
    }
  }

  ctx = paragraph(ctx, 'BEFORE / AFTER (QUALITATIVE)', { bold: true, size: FONT_SIZES.h1 });
  ctx = paragraph(ctx, summary.beforeAfterNarrative);

  ctx = paragraph(ctx, 'WHAT LIKELY WORKED (NOT CAUSAL)', { bold: true, size: FONT_SIZES.h1 });
  ctx = paragraph(ctx, summary.likelyWorkedNarrative);

  ctx = paragraph(ctx, 'EVIDENCE LAYERS', { bold: true, size: FONT_SIZES.h1 });
  ctx = paragraph(ctx, 'Observed: ' + summary.evidenceGuide.observed.join('; '));
  ctx = paragraph(ctx, 'Proxy: ' + summary.evidenceGuide.proxy.join('; '));
  ctx = paragraph(ctx, 'Unsupported without external data: ' + summary.evidenceGuide.unsupported.join('; '));

  ctx = checkPageBreak(ctx, 80);
  ctx.y = drawText(ctx.page, '---', MARGIN, ctx.y, { font: fonts.regular, size: FONT_SIZES.tiny, color: COLORS.midGray });
  ctx.y -= 12;
  ctx = paragraph(ctx, 'Share this PDF when sponsors need proof of workflow execution. Pair with Spotify/Apple/YouTube exports for audience scale.', {
    size: FONT_SIZES.tiny,
  });

  const pageCount = doc.getPageCount();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.getPage(i);
    page.drawText(`PodSignal sponsor proof  |  Page ${i + 1}/${pageCount}`, {
      x: MARGIN,
      y: MARGIN - 18,
      size: FONT_SIZES.tiny,
      font: fonts.regular,
      color: COLORS.midGray,
    });
  }

  return doc.save();
}
