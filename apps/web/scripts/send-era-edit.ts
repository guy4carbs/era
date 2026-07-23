/**
 * send-era-edit — the operator send tool for The Era Edit (No. 001).
 *
 * NOT part of the app. Run against Railway-injected secrets, e.g.:
 *   railway run pnpm --filter web exec tsx apps/web/scripts/send-era-edit.ts --segment test --to you@example.com
 *
 * Three segments:
 *   --segment test --to <inbox>   Render TWO emails to one inbox: (1) the
 *       personalized variant (real Your Week, Worn if <inbox> is a user, else the
 *       fixture) with REAL signed footer links; (2) the waitlist variant
 *       (weekWorn null) whose footer links are the LITERAL Resend merge tag
 *       `{{{RESEND_UNSUBSCRIBE_URL}}}` — the broadcast-semantics preview. Both go
 *       out via the app's sendEmail transport with a `[Era Edit test …]` prefix.
 *   --segment active               Per verified, non-suppressed user: their real
 *       getWeekWornData + signed links, sent INDIVIDUALLY. `--dry-run` prints the
 *       count + the first rendered subject only and sends nothing. REFUSES to send
 *       for real unless `--confirm` is passed.
 *   --segment waitlist             Render the waitlist variant (merge-tag links)
 *       and CREATE a Resend broadcast (draft) against `RESEND_AUDIENCE_ID`. Prints
 *       the broadcast id + a dashboard note. It NEVER triggers the broadcast send
 *       (Atlas stops at create/dry-run this phase). Suppression is irrelevant for
 *       an audience — Resend manages audience opt-outs.
 *
 * Logging discipline: only counts and ids are printed. No email addresses, no
 * keys, no rendered bodies.
 */
import { and, eq } from 'drizzle-orm';

import { createDbClient, user as userTable } from '@era/db';
import { renderEmail, TheEraEdit, issue001, type WeekWornData } from '@era/email';

import { sendEmail } from '../src/lib/send-email.ts';
import { isEmailSuppressed } from '../src/lib/email-suppression.ts';
import { buildUnsubscribeUrl, buildPreferencesUrl } from '../src/lib/email-links.ts';
import { getWeekWornData } from '../src/lib/era-edit-data.ts';

/** Resend's REST base — pinned in code, never user-derived. */
const RESEND_API_BASE = 'https://api.resend.com';
/** Default sender when EMAIL_FROM is unset — a verified Era domain address. */
const DEFAULT_FROM = 'Era <hello@era.style>';

/** The literal Resend merge tags a broadcast uses for its per-recipient links. */
const MERGE_UNSUBSCRIBE = '{{{RESEND_UNSUBSCRIBE_URL}}}';
const MERGE_PREFERENCES = '{{{RESEND_UNSUBSCRIBE_URL}}}';

/** The real-send subject. The preview line is composed by the template. */
const SUBJECT = 'The Era Edit — No. 001';

type Segment = 'test' | 'active' | 'waitlist';

interface Args {
  segment: Segment;
  to?: string;
  dryRun: boolean;
  confirm: boolean;
}

/** Minimal `--flag value` / `--flag` parser. */
function parseArgs(argv: readonly string[]): Args {
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
  const segment = (out.segment ?? 'test') as Segment;
  return {
    segment,
    to: out.to,
    dryRun: out['dry-run'] === 'true',
    confirm: out.confirm === 'true',
  };
}

/** The issue's date, as a YYYY-MM-DD "today" for the 7-day wear window. */
function issueTodayIso(): string {
  const parsed = new Date(issue001.date);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  // Fall back to the process clock if the human-readable date won't parse.
  return new Date().toISOString().slice(0, 10);
}

/** Render the personalized variant for one recipient. */
async function renderPersonalized(
  weekWorn: WeekWornData | null,
  unsubscribeUrl: string,
  preferencesUrl: string,
): Promise<{ html: string; text: string }> {
  return renderEmail(
    TheEraEdit({ issue: issue001, weekWorn, unsubscribeUrl, preferencesUrl }) as Parameters<typeof renderEmail>[0],
  );
}

/** Render the waitlist/broadcast variant (no stats, merge-tag footer links). */
async function renderWaitlistVariant(): Promise<{ html: string; text: string }> {
  return renderEmail(
    TheEraEdit({
      issue: issue001,
      weekWorn: null,
      unsubscribeUrl: MERGE_UNSUBSCRIBE,
      preferencesUrl: MERGE_PREFERENCES,
    }) as Parameters<typeof renderEmail>[0],
  );
}

// -----------------------------------------------------------------------------
// test segment
// -----------------------------------------------------------------------------

async function runTest(args: Args): Promise<number> {
  const to = args.to;
  if (!to) {
    console.error('[era-edit] --to <inbox> is required for --segment test.');
    return 1;
  }

  const db = createDbClient(process.env.DATABASE_URL!);

  // Personalized variant: if --to is a real user, use their actual week; else the
  // fixture. Footer links are the REAL signed links for this inbox.
  const [row] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, to.trim().toLowerCase()))
    .limit(1);

  let weekWorn: WeekWornData | null;
  if (row) {
    weekWorn = await getWeekWornData(db, row.id, issueTodayIso());
  } else {
    weekWorn = {
      mostWorn: { name: 'linen shirt', count: 4 },
      costPerWear: { name: 'linen shirt', formatted: '$12.50' },
    };
  }

  const personalized = await renderPersonalized(weekWorn, buildUnsubscribeUrl(to), buildPreferencesUrl(to));
  const waitlist = await renderWaitlistVariant();

  await sendEmail({ to, subject: `[Era Edit test] ${SUBJECT}`, html: personalized.html, text: personalized.text });
  await sendEmail({
    to,
    subject: `[Era Edit test — waitlist] ${SUBJECT}`,
    html: waitlist.html,
    text: waitlist.text,
  });

  console.log('[era-edit] test: sent 2 emails (personalized + waitlist) to the requested inbox.');
  return 0;
}

// -----------------------------------------------------------------------------
// active segment
// -----------------------------------------------------------------------------

async function runActive(args: Args): Promise<number> {
  if (!args.dryRun && !args.confirm) {
    console.error('[era-edit] active: refusing to send. Re-run with --dry-run to preview, or --confirm to send.');
    return 1;
  }

  const db = createDbClient(process.env.DATABASE_URL!);
  const todayIso = issueTodayIso();

  // Verified users only — the marketing list is people who confirmed their email.
  const users = await db
    .select({ id: userTable.id, email: userTable.email })
    .from(userTable)
    .where(and(eq(userTable.emailVerified, true)));

  let firstSubject: string | null = null;
  let sent = 0;
  let skipped = 0;

  for (const u of users) {
    if (await isEmailSuppressed(db, u.email)) {
      skipped += 1;
      continue;
    }
    const weekWorn = await getWeekWornData(db, u.id, todayIso);
    const rendered = await renderPersonalized(weekWorn, buildUnsubscribeUrl(u.email), buildPreferencesUrl(u.email));
    firstSubject ??= SUBJECT;

    if (args.dryRun) {
      // Count only — no send, and no address printed.
      sent += 1;
      continue;
    }
    await sendEmail({ to: u.email, subject: SUBJECT, html: rendered.html, text: rendered.text });
    sent += 1;
  }

  if (args.dryRun) {
    console.log(
      `[era-edit] active DRY RUN: ${sent} eligible, ${skipped} suppressed. First subject: "${firstSubject ?? '(none)'}". Nothing sent.`,
    );
  } else {
    console.log(`[era-edit] active: sent ${sent}, skipped ${skipped} suppressed.`);
  }
  return 0;
}

// -----------------------------------------------------------------------------
// waitlist segment
// -----------------------------------------------------------------------------

async function runWaitlist(args: Args): Promise<number> {
  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!apiKey || apiKey.startsWith('change-me')) {
    console.error('[era-edit] waitlist: no real RESEND_API_KEY — cannot create a broadcast.');
    return 1;
  }
  if (!audienceId || audienceId.trim() === '') {
    console.error('[era-edit] waitlist: RESEND_AUDIENCE_ID is unset — cannot target the audience.');
    return 1;
  }

  const { html, text } = await renderWaitlistVariant();
  const from = process.env.EMAIL_FROM?.trim() ? process.env.EMAIL_FROM! : DEFAULT_FROM;

  if (args.dryRun) {
    console.log('[era-edit] waitlist DRY RUN: rendered the broadcast variant. No broadcast created.');
    return 0;
  }

  // CREATE the broadcast as a draft. We never call /broadcasts/{id}/send here —
  // Atlas triggers the actual send from the Resend dashboard after review.
  const res = await fetch(`${RESEND_API_BASE}/broadcasts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ audience_id: audienceId, from, subject: SUBJECT, html, text }),
  });
  if (!res.ok) {
    // Status only — never the body/key.
    console.error(`[era-edit] waitlist: broadcast create failed (status ${res.status}).`);
    return 1;
  }
  const body = (await res.json().catch(() => ({}))) as { id?: string };
  console.log(
    `[era-edit] waitlist: broadcast created (draft) — id: ${body.id ?? '(no id returned)'}. ` +
      'Review and send it from the Resend dashboard; this script never triggers the send.',
  );
  return 0;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  switch (args.segment) {
    case 'test':
      return runTest(args);
    case 'active':
      return runActive(args);
    case 'waitlist':
      return runWaitlist(args);
    default:
      console.error(`[era-edit] unknown --segment "${String(args.segment)}". Use test | active | waitlist.`);
      return 1;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    // Never surface a key or an address; a render/DB error carries no Era secret.
    console.error('[era-edit] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
