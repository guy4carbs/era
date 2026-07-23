/**
 * send-test — fire (or, when no provider is wired, dump) a rendered template.
 *
 *   tsx scripts/send-test.ts --template base-sample --to someone@example.com
 *
 * This is the developer's one-shot check that a template renders and, with a
 * real key, actually leaves the building. It reuses the SAME dormant-credential
 * truth-table as `apps/web/src/lib/send-email.ts` — a `change-me-…` key is not a
 * real key — so it behaves identically to the app's transport:
 *
 *   - Real `RESEND_API_KEY` → render the template and POST it to Resend, then
 *     print the Resend message id. The key is NEVER printed.
 *   - No / placeholder key → write the rendered HTML to a temp file and print
 *     its path with a greppable `[era-email] no provider wired` line; exit 0.
 *   - Unknown template name → list the available templates; exit 1.
 */
import { createElement, type ReactElement } from 'react';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { renderEmail } from '../src/render.ts';
import { BaseSampleEmail } from '../src/templates/base-sample.tsx';
import { MagicLinkEmail } from '../src/templates/magic-link.tsx';
import { WelcomeEmail } from '../src/templates/welcome.tsx';
import { WaitlistEmail } from '../src/templates/waitlist.tsx';
import { LaunchInviteEmail } from '../src/templates/launch-invite.tsx';
import { DeletionEmail } from '../src/templates/deletion.tsx';
import { EraPlusReceiptEmail } from '../src/templates/era-plus-receipt.tsx';

/** Resend's transactional send endpoint — pinned in code, never user-derived. */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** Default sender when `EMAIL_FROM` is unset — a verified Era domain address. */
const DEFAULT_FROM = 'Era <hello@era.style>';

/** The templates this script can render, by their CLI name. */
const TEMPLATES: Record<string, () => ReactElement> = {
  'base-sample': () => createElement(BaseSampleEmail),
  'magic-link': () => createElement(MagicLinkEmail, { url: 'https://era.style/sign-in/confirm?next=example' }),
  welcome: () => createElement(WelcomeEmail, { name: 'Guy', appUrl: 'https://era.style' }),
  waitlist: () => createElement(WaitlistEmail, { position: 214 }),
  'launch-invite': () => createElement(LaunchInviteEmail, { accessUrl: 'https://era.style' }),
  deletion: () => createElement(DeletionEmail),
  'era-plus-receipt': () => createElement(EraPlusReceiptEmail),
};

/**
 * True only for a real, operator-supplied Resend key. Mirrors
 * `isRealCredential` in `apps/web/src/lib/send-email.ts`: the committed
 * `.env.example` ships an obvious `change-me-…` placeholder, and treating that
 * as configured would fire a request that can only fail.
 */
function isRealCredential(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  return !value.startsWith('change-me');
}

/** Minimal `--flag value` parser — enough for `--template` and `--to`. */
function parseArgs(argv: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg?.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[key] = next;
        i += 1;
      } else {
        out[key] = 'true';
      }
    }
  }
  return out;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const templateName = args.template ?? 'base-sample';
  const to = args.to;

  const factory = TEMPLATES[templateName];
  if (!factory) {
    console.error(`[era-email] unknown template "${templateName}". Available templates:`);
    for (const name of Object.keys(TEMPLATES)) {
      console.error(`  - ${name}`);
    }
    return 1;
  }

  const { html, text } = await renderEmail(factory());
  const subject = `Era email test — ${templateName}`;

  const apiKey = process.env.RESEND_API_KEY;
  if (isRealCredential(apiKey)) {
    const from = process.env.EMAIL_FROM?.trim() ? process.env.EMAIL_FROM : DEFAULT_FROM;
    if (!to) {
      console.error('[era-email] --to is required when a real RESEND_API_KEY is set.');
      return 1;
    }
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    if (!response.ok) {
      // Status only — never the response body and never the key.
      console.error(`[era-email] send failed (status ${response.status}).`);
      return 1;
    }
    const body = (await response.json()) as { id?: string };
    console.log(`[era-email] sent "${templateName}" — Resend id: ${body.id ?? '(no id returned)'}`);
    return 0;
  }

  // No real key: dump the rendered HTML to a temp file so the render is
  // inspectable without a provider. Mirrors the dev fallback of send-email.ts.
  const dir = mkdtempSync(join(tmpdir(), 'era-email-'));
  const file = join(dir, `${templateName}.html`);
  writeFileSync(file, html, 'utf8');
  console.log(`[era-email] no provider wired — wrote rendered "${templateName}" to ${file}`);
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    // Never surface a key; a render/parse error carries no Era secret.
    console.error('[era-email] send-test failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
