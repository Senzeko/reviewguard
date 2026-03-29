/**
 * Load .env then send one test message via Resend SMTP.
 * Usage:
 *   npm run email:test -- you@example.com
 *   npm run email:test -- you@example.com auth     (SMTP_FROM_AUTH — same as password reset)
 *   npm run email:test -- you@example.com billing  (SMTP_FROM_BILLING)
 *   TEST_EMAIL=you@example.com npm run email:test
 */
import { config } from 'dotenv';

config({ override: true });

const FROM_KEYS = ['default', 'auth', 'billing'] as const;

const a2 = (process.argv[2] ?? process.env['TEST_EMAIL'] ?? '').trim();
const a3 = (process.argv[3] ?? '').trim().toLowerCase();

let to: string;
let fromKey: (typeof FROM_KEYS)[number] = 'default';

if (a3 && (FROM_KEYS as readonly string[]).includes(a3)) {
  to = a2;
  fromKey = a3 as (typeof FROM_KEYS)[number];
} else if (a2 && !a3) {
  to = a2;
} else if (!a2) {
  console.error('Usage: npm run email:test -- <email@example.com> [default|auth|billing]');
  console.error('   or: TEST_EMAIL=you@example.com npm run email:test');
  process.exit(1);
} else {
  to = a2;
}

const { sendTestEmail } = await import('../src/email/service.js');

try {
  await sendTestEmail(to, fromKey);
  console.log(`OK — test email sent to ${to} (sender: ${fromKey})`);
} catch (err) {
  console.error(err);
  process.exit(1);
}
