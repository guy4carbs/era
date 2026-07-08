/**
 * One-off: send ONE of each transactional email Era can produce to a single
 * inbox so the rendered designs can be eyeballed in a real mail client.
 *
 * NOT part of the app. Run against Railway-injected secrets:
 *   railway run pnpm --filter web exec tsx apps/web/scripts/send-sample-emails.ts
 *
 * Reads RESEND_API_KEY + EMAIL_FROM from the env (never printed). Every subject
 * is prefixed with "[Era sample] " so the real inbox is obviously a test batch.
 */
import { renderWelcomeEmail } from '../src/lib/send-welcome-email.ts';
import { renderWaitlistEmail } from '../src/lib/send-waitlist-email.ts';
import { renderDeletionEmail } from '../src/lib/send-deletion-email.ts';
import { renderPriceDropEmail } from '../src/lib/send-price-drop-email.ts';
import { sendMagicLinkEmail } from '../src/lib/send-magic-link-email.ts';

const TO = 'guy4carbs@gmail.com';
const SUBJECT_PREFIX = '[Era sample] ';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

type Rendered = { subject: string; html: string; text: string };

/**
 * The magic-link render (`renderEmail`) is private to its module — only the
 * `sendMagicLinkEmail` sender is exported. Capture the rendered body by handing
 * the sender a fetch that intercepts the Resend POST and short-circuits it, so
 * nothing is actually sent from this step; we re-send it ourselves below with
 * the sample prefix. Requires a real RESEND_API_KEY (else the sender dev-logs).
 */
async function captureMagicLink(url: string): Promise<Rendered> {
  let captured: Rendered | undefined;
  const spyFetch: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    captured = { subject: body.subject, html: body.html, text: body.text };
    return new Response(JSON.stringify({ id: 'captured-locally' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  await sendMagicLinkEmail({ email: 'sample-capture@era.style', url }, { fetchImpl: spyFetch });
  if (!captured) {
    throw new Error('magic-link capture failed — no Resend POST intercepted (is RESEND_API_KEY real?)');
  }
  return captured;
}

/** POST one rendered email to Resend. Returns the Resend id (never the key). */
async function send(label: string, rendered: Rendered): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not set in the environment');
  }
  const from = process.env.EMAIL_FROM?.trim() ? process.env.EMAIL_FROM : 'Era <hello@era.style>';
  const subject = `${SUBJECT_PREFIX}${rendered.subject}`;

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: TO, subject, html: rendered.html, text: rendered.text }),
  });

  const payload = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) {
    console.error(`FAIL  ${label}  status=${res.status}  ${payload.message ?? ''}`);
    throw new Error(`send failed for ${label}`);
  }
  console.log(`OK    ${label}  status=${res.status}  id=${payload.id ?? '(no id)'}  subject="${subject}"`);
}

async function main(): Promise<void> {
  const magicLink = await captureMagicLink(
    'https://era.style/sign-in/confirm?next=%2F&token=sample-8f3c1a9e2b7d4f6a',
  );

  const jobs: Array<[string, Rendered]> = [
    ['magic-link', magicLink],
    ['welcome', renderWelcomeEmail({ url: 'https://era.style' })],
    ['waitlist', renderWaitlistEmail()],
    ['deletion', renderDeletionEmail()],
    [
      'price-drop',
      renderPriceDropEmail({
        title: 'Relaxed Wool Trouser',
        brand: 'The Row',
        retailer: 'The Row',
        oldPrice: 890,
        newPrice: 620,
        currency: 'USD',
        affiliateUrl: 'https://example.com',
      }),
    ],
  ];

  let failures = 0;
  for (const [label, rendered] of jobs) {
    try {
      await send(label, rendered);
    } catch {
      failures += 1;
    }
  }

  console.log(`\nDone. ${jobs.length - failures}/${jobs.length} sent to ${TO}.`);
  if (failures > 0) {
    process.exitCode = 1;
  }
}

void main();
