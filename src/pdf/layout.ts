/**
 * src/pdf/layout.ts
 *
 * PDF layout constants, colors, fonts, and drawing helpers.
 * Every section file imports from this module — never hardcode dimensions or colors.
 */

import {
  PDFDocument,
  PDFPage,
  PDFFont,
  StandardFonts,
  rgb,
  type Color,
} from 'pdf-lib';

// ── Page dimensions (US Letter) ──────────────────────────────────────────────

export const PAGE_WIDTH = 612;
export const PAGE_HEIGHT = 792;
export const MARGIN = 56;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// ── Brand colors ─────────────────────────────────────────────────────────────

export const COLORS = {
  navy: rgb(0.122, 0.306, 0.471),
  blue: rgb(0.18, 0.373, 0.643),
  red: rgb(0.753, 0.18, 0.18),
  amber: rgb(0.729, 0.455, 0.09),
  green: rgb(0.114, 0.62, 0.455),
  black: rgb(0, 0, 0),
  darkGray: rgb(0.247, 0.247, 0.247),
  midGray: rgb(0.557, 0.557, 0.557),
  lightGray: rgb(0.878, 0.878, 0.878),
  offWhite: rgb(0.965, 0.965, 0.961),
  white: rgb(1, 1, 1),
};

// ── Font sizes ───────────────────────────────────────────────────────────────

export const FONT_SIZES = {
  title: 22,
  h1: 14,
  h2: 11,
  body: 10,
  small: 8.5,
  tiny: 7.5,
};

// ── DrawContext ───────────────────────────────────────────────────────────────

export interface DrawContext {
  page: PDFPage;
  doc: PDFDocument;
  y: number;
  fonts: {
    regular: PDFFont;
    bold: PDFFont;
    italic: PDFFont;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sanitize text for WinAnsi encoding (standard PDF fonts).
 * Replaces common Unicode symbols with ASCII equivalents and strips anything
 * outside the WinAnsi range to prevent pdf-lib encoding errors.
 */
export function sanitizeForPdf(text: string): string {
  return text
    // Common Unicode arrows and symbols → ASCII equivalents
    .replace(/\u2192/g, '->')   // →
    .replace(/\u2190/g, '<-')   // ←
    .replace(/\u2194/g, '<->') // ↔
    .replace(/\u2014/g, '--')   // — (em dash)
    .replace(/\u2013/g, '-')    // – (en dash)
    .replace(/\u2018/g, "'")    // '
    .replace(/\u2019/g, "'")    // '
    .replace(/\u201c/g, '"')    // "
    .replace(/\u201d/g, '"')    // "
    .replace(/\u2026/g, '...')  // …
    .replace(/\u2022/g, '*')    // •
    .replace(/\u2264/g, '<=')   // ≤
    .replace(/\u2265/g, '>=')   // ≥
    .replace(/\u00a0/g, ' ')    // non-breaking space
    // Strip any remaining non-WinAnsi characters (keep printable ASCII + common Latin-1)
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

export function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const words = sanitizeForPdf(text).split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length === 0) lines.push('');
  return lines;
}

export function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  opts: {
    font: PDFFont;
    size: number;
    color?: Color;
    maxWidth?: number;
  },
): number {
  const safeText = sanitizeForPdf(text);
  const color = opts.color ?? COLORS.black;
  const lineHeight = opts.size * 1.4;

  if (opts.maxWidth) {
    const lines = wrapText(safeText, opts.font, opts.size, opts.maxWidth);
    let cy = y;
    for (const line of lines) {
      page.drawText(line, { x, y: cy, size: opts.size, font: opts.font, color });
      cy -= lineHeight;
    }
    return cy;
  }

  page.drawText(safeText, { x, y, size: opts.size, font: opts.font, color });
  return y - lineHeight;
}

export function drawLine(
  page: PDFPage,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts?: { color?: Color; thickness?: number },
): void {
  page.drawLine({
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    color: opts?.color ?? COLORS.lightGray,
    thickness: opts?.thickness ?? 1,
  });
}

export function drawRect(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  opts?: {
    fill?: Color;
    border?: Color;
    borderWidth?: number;
  },
): void {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: opts?.fill,
    borderColor: opts?.border,
    borderWidth: opts?.borderWidth ?? 0,
  });
}

export function drawBadge(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  color: Color,
  font: PDFFont,
): void {
  const safeText = sanitizeForPdf(text);
  const fontSize = 8;
  const textWidth = font.widthOfTextAtSize(safeText, fontSize);
  const padX = 6;
  const padY = 3;
  const badgeWidth = textWidth + padX * 2;
  const badgeHeight = fontSize + padY * 2;

  drawRect(page, x, y - padY, badgeWidth, badgeHeight, { fill: color });
  page.drawText(safeText, {
    x: x + padX,
    y: y + 1,
    size: fontSize,
    font,
    color: COLORS.white,
  });
}

export function addPage(doc: PDFDocument): PDFPage {
  return doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
}

export function newPage(
  doc: PDFDocument,
  fonts: DrawContext['fonts'],
): DrawContext {
  const page = addPage(doc);
  return { page, doc, y: PAGE_HEIGHT - MARGIN, fonts };
}

export function checkPageBreak(ctx: DrawContext, neededHeight: number): DrawContext {
  if (ctx.y - neededHeight < MARGIN + 60) {
    return newPage(ctx.doc, ctx.fonts);
  }
  return ctx;
}

export async function embedFonts(
  doc: PDFDocument,
): Promise<DrawContext['fonts']> {
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.TimesRoman);
  return { regular, bold, italic };
}

export function drawSectionHeader(ctx: DrawContext, title: string): DrawContext {
  ctx = checkPageBreak(ctx, 40);
  ctx.y = drawText(ctx.page, title, MARGIN, ctx.y, {
    font: ctx.fonts.bold,
    size: FONT_SIZES.h1,
    color: COLORS.navy,
  });
  drawLine(ctx.page, MARGIN, ctx.y + 6, MARGIN + CONTENT_WIDTH, ctx.y + 6, {
    color: COLORS.navy,
    thickness: 1.5,
  });
  ctx.y -= 8;
  return ctx;
}

export function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatDateTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
