/**
 * src/email/service.ts
 *
 * Email notification service using nodemailer.
 * Sends transactional emails when reviews are scored, PDFs generated, etc.
 *
 * In development (no SMTP config), logs emails to console instead of sending.
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

// ── Configuration ────────────────────────────────────────────────────────────

const SMTP_HOST = process.env['SMTP_HOST'] ?? '';
const SMTP_PORT = parseInt(process.env['SMTP_PORT'] ?? '587', 10);
const SMTP_USER = process.env['SMTP_USER'] ?? '';
const SMTP_PASS = process.env['SMTP_PASS'] ?? '';
const SMTP_FROM = process.env['SMTP_FROM'] ?? 'ReviewGuard AI <noreply@reviewguard.ai>';
const APP_URL = process.env['APP_URL'] ?? 'http://localhost:5173';

const isConfigured = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

let _transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!isConfigured) return null;
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return _transporter;
}

// ── Send helper ──────────────────────────────────────────────────────────────

interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function send(msg: EmailMessage): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    // Dev mode — log to console
    console.log(`[email/dev] To: ${msg.to}`);
    console.log(`[email/dev] Subject: ${msg.subject}`);
    console.log(`[email/dev] Body: ${msg.text.slice(0, 200)}...`);
    return;
  }

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
    console.log(`[email] Sent "${msg.subject}" to ${msg.to}`);
  } catch (err) {
    console.error(`[email] Failed to send to ${msg.to}:`, err);
    // Don't throw — email failures shouldn't break the main flow
  }
}

// ── Templates ────────────────────────────────────────────────────────────────

function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="border-bottom:3px solid #1F4E79;padding-bottom:16px;margin-bottom:24px;">
    <h2 style="margin:0;color:#1F4E79;">ReviewGuard AI</h2>
  </div>
  ${body}
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e0e0e0;font-size:12px;color:#888;">
    <p>You're receiving this because you're a ReviewGuard AI merchant.
    <a href="${APP_URL}/settings" style="color:#1F4E79;">Manage notification preferences</a></p>
  </div>
</body>
</html>`;
}

// ── Public notification functions ─────────────────────────────────────────────

/**
 * Sent when a new Google review is received via webhook.
 */
export async function notifyNewReview(params: {
  to: string;
  merchantName: string;
  reviewerName: string;
  rating: number;
  reviewText: string;
  investigationId: string;
}): Promise<void> {
  const stars = '\u2605'.repeat(params.rating) + '\u2606'.repeat(5 - params.rating);
  const consoleUrl = `${APP_URL}/console/${params.investigationId}`;

  await send({
    to: params.to,
    subject: `New ${params.rating}-star review from ${params.reviewerName} | ${params.merchantName}`,
    html: wrapHtml('New Review', `
      <h3 style="color:#1F4E79;margin-bottom:8px;">New Google Review Received</h3>
      <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0 0 8px;"><strong>${params.reviewerName}</strong> &mdash; <span style="color:${params.rating <= 2 ? '#E24B4A' : params.rating <= 3 ? '#BA7417' : '#1D9E75'}">${stars}</span></p>
        <p style="margin:0;color:#555;font-style:italic;">"${params.reviewText.slice(0, 200)}${params.reviewText.length > 200 ? '...' : ''}"</p>
      </div>
      <p>Our forensic engine is now analyzing this review against your POS transaction records. You'll receive another email once scoring is complete.</p>
      <a href="${consoleUrl}" style="display:inline-block;background:#1F4E79;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View Investigation</a>
    `),
    text: `New ${params.rating}-star Google review from ${params.reviewerName} for ${params.merchantName}.\n\n"${params.reviewText.slice(0, 200)}"\n\nView investigation: ${consoleUrl}`,
  });
}

/**
 * Sent when the forensic engine finishes scoring a review.
 */
export async function notifyScoringComplete(params: {
  to: string;
  merchantName: string;
  reviewerName: string;
  score: number;
  matchStatus: string;
  consoleTier: string;
  investigationId: string;
}): Promise<void> {
  const consoleUrl = `${APP_URL}/console/${params.investigationId}`;

  const tierColors: Record<string, string> = {
    DISPUTABLE: '#E24B4A',
    ADVISORY: '#BA7417',
    LEGITIMATE: '#1D9E75',
  };
  const tierLabels: Record<string, string> = {
    DISPUTABLE: 'Disputable - Likely Fake',
    ADVISORY: 'Advisory - Partial Match',
    LEGITIMATE: 'Verified Customer',
  };

  const color = tierColors[params.consoleTier] ?? '#888';
  const label = tierLabels[params.consoleTier] ?? params.consoleTier;

  const actionText = params.consoleTier === 'DISPUTABLE'
    ? 'This review may be eligible for dispute. Review the evidence and decide whether to proceed.'
    : params.consoleTier === 'ADVISORY'
    ? 'This review shows partial evidence of a real customer. Review carefully before taking action.'
    : 'This reviewer appears to be a verified customer. No dispute action is recommended.';

  await send({
    to: params.to,
    subject: `Scoring complete: ${label} (${params.score}/100) | ${params.reviewerName}`,
    html: wrapHtml('Scoring Complete', `
      <h3 style="color:#1F4E79;margin-bottom:8px;">Forensic Analysis Complete</h3>
      <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0 0 8px;">Review by <strong>${params.reviewerName}</strong></p>
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="font-size:32px;font-weight:700;color:${color};">${params.score}</span>
          <span style="font-size:14px;color:#888;">/100</span>
          <span style="display:inline-block;background:${color};color:white;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;">${label}</span>
        </div>
        <p style="margin:12px 0 0;color:#555;">${actionText}</p>
      </div>
      <a href="${consoleUrl}" style="display:inline-block;background:#1F4E79;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Review Evidence</a>
    `),
    text: `Forensic analysis complete for review by ${params.reviewerName}.\n\nScore: ${params.score}/100 — ${label}\n\n${actionText}\n\nView evidence: ${consoleUrl}`,
  });
}

/**
 * Sent when a dispute PDF has been generated and is ready for download.
 */
export async function notifyPdfReady(params: {
  to: string;
  merchantName: string;
  reviewerName: string;
  caseId: string;
  investigationId: string;
}): Promise<void> {
  const consoleUrl = `${APP_URL}/console/${params.investigationId}`;

  await send({
    to: params.to,
    subject: `Dispute packet ready: ${params.caseId} | ${params.reviewerName}`,
    html: wrapHtml('PDF Ready', `
      <h3 style="color:#1F4E79;margin-bottom:8px;">Dispute Evidence Packet Ready</h3>
      <div style="background:#f0f7e6;border-radius:8px;padding:16px;margin:16px 0;border-left:4px solid #1D9E75;">
        <p style="margin:0 0 8px;"><strong>Case ID:</strong> ${params.caseId}</p>
        <p style="margin:0;"><strong>Review by:</strong> ${params.reviewerName}</p>
      </div>
      <p>Your dispute evidence PDF is ready for download. Use this document when submitting your dispute to Google.</p>
      <a href="${consoleUrl}" style="display:inline-block;background:#1D9E75;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Download PDF</a>
    `),
    text: `Dispute evidence packet ready!\n\nCase ID: ${params.caseId}\nReview by: ${params.reviewerName}\n\nDownload: ${consoleUrl}`,
  });
}

/**
 * Sent when a POS sync completes (summary).
 */
export async function notifyPosSyncComplete(params: {
  to: string;
  merchantName: string;
  provider: string;
  transactionsInserted: number;
}): Promise<void> {
  // Only notify if new transactions were found (skip zero-count syncs)
  if (params.transactionsInserted === 0) return;

  await send({
    to: params.to,
    subject: `POS sync: ${params.transactionsInserted} new transactions | ${params.merchantName}`,
    html: wrapHtml('POS Sync Complete', `
      <h3 style="color:#1F4E79;margin-bottom:8px;">Transaction Sync Complete</h3>
      <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0 0 4px;"><strong>Provider:</strong> ${params.provider}</p>
        <p style="margin:0;"><strong>New transactions imported:</strong> ${params.transactionsInserted}</p>
      </div>
      <p>These transactions are now available for forensic matching against incoming Google reviews.</p>
      <a href="${APP_URL}/dashboard" style="display:inline-block;background:#1F4E79;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View Dashboard</a>
    `),
    text: `POS sync complete for ${params.merchantName}.\n\nProvider: ${params.provider}\nNew transactions: ${params.transactionsInserted}`,
  });
}

/**
 * Daily digest of review activity.
 */
export async function notifyDailyDigest(params: {
  to: string;
  merchantName: string;
  newReviews: number;
  scored: number;
  disputable: number;
  advisory: number;
  legitimate: number;
}): Promise<void> {
  // Skip if nothing to report
  if (params.newReviews === 0 && params.scored === 0) return;

  await send({
    to: params.to,
    subject: `Daily digest: ${params.newReviews} new reviews | ${params.merchantName}`,
    html: wrapHtml('Daily Digest', `
      <h3 style="color:#1F4E79;margin-bottom:8px;">Daily Review Summary</h3>
      <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin:16px 0;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:4px 0;color:#888;">New reviews received</td><td style="padding:4px 0;text-align:right;font-weight:600;">${params.newReviews}</td></tr>
          <tr><td style="padding:4px 0;color:#888;">Scoring completed</td><td style="padding:4px 0;text-align:right;font-weight:600;">${params.scored}</td></tr>
          <tr><td style="padding:4px 0;color:#E24B4A;">Disputable</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#E24B4A;">${params.disputable}</td></tr>
          <tr><td style="padding:4px 0;color:#BA7417;">Advisory</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#BA7417;">${params.advisory}</td></tr>
          <tr><td style="padding:4px 0;color:#1D9E75;">Verified customers</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#1D9E75;">${params.legitimate}</td></tr>
        </table>
      </div>
      <a href="${APP_URL}/dashboard" style="display:inline-block;background:#1F4E79;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View Dashboard</a>
    `),
    text: `Daily digest for ${params.merchantName}:\n\nNew reviews: ${params.newReviews}\nScored: ${params.scored}\nDisputable: ${params.disputable}\nAdvisory: ${params.advisory}\nVerified: ${params.legitimate}\n\nDashboard: ${APP_URL}/dashboard`,
  });
}

/** Check if SMTP is configured */
export function isEmailConfigured(): boolean {
  return isConfigured;
}
