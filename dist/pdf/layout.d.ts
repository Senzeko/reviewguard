/**
 * src/pdf/layout.ts
 *
 * PDF layout constants, colors, fonts, and drawing helpers.
 * Every section file imports from this module — never hardcode dimensions or colors.
 */
import { PDFDocument, PDFPage, PDFFont, type Color } from 'pdf-lib';
export declare const PAGE_WIDTH = 612;
export declare const PAGE_HEIGHT = 792;
export declare const MARGIN = 56;
export declare const CONTENT_WIDTH: number;
export declare const COLORS: {
    navy: import("pdf-lib").RGB;
    blue: import("pdf-lib").RGB;
    red: import("pdf-lib").RGB;
    amber: import("pdf-lib").RGB;
    green: import("pdf-lib").RGB;
    black: import("pdf-lib").RGB;
    darkGray: import("pdf-lib").RGB;
    midGray: import("pdf-lib").RGB;
    lightGray: import("pdf-lib").RGB;
    offWhite: import("pdf-lib").RGB;
    white: import("pdf-lib").RGB;
};
export declare const FONT_SIZES: {
    title: number;
    h1: number;
    h2: number;
    body: number;
    small: number;
    tiny: number;
};
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
/**
 * Sanitize text for WinAnsi encoding (standard PDF fonts).
 * Replaces common Unicode symbols with ASCII equivalents and strips anything
 * outside the WinAnsi range to prevent pdf-lib encoding errors.
 */
export declare function sanitizeForPdf(text: string): string;
export declare function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[];
export declare function drawText(page: PDFPage, text: string, x: number, y: number, opts: {
    font: PDFFont;
    size: number;
    color?: Color;
    maxWidth?: number;
}): number;
export declare function drawLine(page: PDFPage, x1: number, y1: number, x2: number, y2: number, opts?: {
    color?: Color;
    thickness?: number;
}): void;
export declare function drawRect(page: PDFPage, x: number, y: number, width: number, height: number, opts?: {
    fill?: Color;
    border?: Color;
    borderWidth?: number;
}): void;
export declare function drawBadge(page: PDFPage, text: string, x: number, y: number, color: Color, font: PDFFont): void;
export declare function addPage(doc: PDFDocument): PDFPage;
export declare function newPage(doc: PDFDocument, fonts: DrawContext['fonts']): DrawContext;
export declare function checkPageBreak(ctx: DrawContext, neededHeight: number): DrawContext;
export declare function embedFonts(doc: PDFDocument): Promise<DrawContext['fonts']>;
export declare function drawSectionHeader(ctx: DrawContext, title: string): DrawContext;
export declare function formatDate(d: Date | string): string;
export declare function formatDateTime(d: Date | string): string;
export declare function formatCents(cents: number): string;
//# sourceMappingURL=layout.d.ts.map