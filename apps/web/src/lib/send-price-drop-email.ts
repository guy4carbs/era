/**
 * The price-drop alert email for Era's Shop — sent when a saved piece gets
 * cheaper at the retailer.
 *
 * Rendering (`renderPriceDropEmail`) and sending (`sendPriceDropEmail`) are
 * split so the copy is snapshot-testable without a network. Sending routes
 * through the shared `sendEmail` transport (`lib/send-email.ts`), so it inherits
 * the same dormant-credential gate as every other Era email: with no real
 * `RESEND_API_KEY` it is a no-op in dev (one greppable line) and a loud failure
 * in prod. Wave 2's cron price-check calls `sendPriceDropEmail`.
 *
 * Copy note: the visible strings below are inline placeholders in Era's voice —
 * warm, understated, no false urgency (the trust rule: a price drop is a heads-
 * up, never a nudge to buy). Quill owns the canonical copy; when
 * `strings.notifications` (or `strings.shop`) lands in `@era/core`, lift these
 * into it and import them here, exactly as the rest of the app reads its copy.
 */
import { type DbClient } from '@era/db';

import { isEmailSuppressed } from './email-suppression.ts';
import { sendEmail, type SendEmailDeps } from './send-email.ts';

/** Everything the price-drop email renders from — resolved by the caller. */
export interface PriceDropContent {
  /** The saved piece's name, e.g. "Wool-blend overcoat". */
  readonly title: string;
  /** The brand, e.g. "Acne Studios". */
  readonly brand: string;
  /** Where the drop is, e.g. "Ssense" — used in copy and the click-out. */
  readonly retailer: string;
  /** Price when the user saved it, in `currency`'s major units. */
  readonly oldPrice: number;
  /** The new, lower price, in `currency`'s major units. */
  readonly newPrice: number;
  /** ISO 4217 code, e.g. "USD" — drives the money formatting. */
  readonly currency: string;
  /** The affiliate link to the product (disclosure lives in the Shop UI). */
  readonly affiliateUrl: string;
}

/** A price-drop email plus its recipient — everything one send needs. */
export interface PriceDropEmail extends PriceDropContent {
  readonly to: string;
  /**
   * The DB client, used only for the suppression pre-check. Optional so the
   * existing callers (and tests) that don't wire a db keep working unchanged;
   * when supplied, a hard-bounced/complained recipient is skipped before the
   * automated send, so price alerts respect bounces too.
   */
  readonly db?: DbClient;
}

/**
 * Format an amount in its currency for display. Falls back to
 * `${currency} ${amount}` if the runtime rejects the currency code, so a bad
 * feed value degrades to something readable rather than throwing mid-render.
 */
function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * Render the price-drop email — warm, understated Era voice, one clear action.
 * Pure: no env, no network, so the copy is snapshot-testable in isolation.
 */
export function renderPriceDropEmail(content: PriceDropContent): { subject: string; html: string; text: string } {
  const { title, brand, retailer, oldPrice, newPrice, currency, affiliateUrl } = content;
  const was = formatMoney(oldPrice, currency);
  const now = formatMoney(newPrice, currency);
  const saved = formatMoney(Math.max(oldPrice - newPrice, 0), currency);

  const subject = `${title} dropped to ${now}`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1b1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9f7;">
      <tr>
        <td align="center" style="padding:48px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;">
            <tr>
              <td style="font-size:20px;font-weight:600;letter-spacing:0.02em;padding-bottom:24px;">Era</td>
            </tr>
            <tr>
              <td style="font-size:16px;line-height:1.6;padding-bottom:8px;">
                Something you saved just got a little friendlier on price.
              </td>
            </tr>
            <tr>
              <td style="font-size:16px;line-height:1.6;font-weight:600;padding-bottom:4px;">${title}</td>
            </tr>
            <tr>
              <td style="font-size:14px;line-height:1.6;color:#6b6864;padding-bottom:20px;">
                ${brand} · ${retailer}
              </td>
            </tr>
            <tr>
              <td style="font-size:16px;line-height:1.6;padding-bottom:28px;">
                Now <strong>${now}</strong> <span style="color:#9a9691;text-decoration:line-through;">${was}</span>
                <span style="color:#6b6864;">— ${saved} off</span>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:28px;">
                <a href="${affiliateUrl}" style="display:inline-block;background:#1c1b1a;color:#faf9f7;text-decoration:none;font-size:15px;font-weight:500;padding:13px 28px;border-radius:10px;">View at ${retailer}</a>
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;line-height:1.6;color:#9a9691;border-top:1px solid #ecebe8;padding-top:20px;">
                No rush — it'll wait. We only tell you when a piece you saved actually drops.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    'Something you saved just got a little friendlier on price.',
    '',
    title,
    `${brand} · ${retailer}`,
    '',
    `Now ${now} (was ${was}) — ${saved} off.`,
    '',
    `View at ${retailer}: ${affiliateUrl}`,
    '',
    "No rush — it'll wait. We only tell you when a piece you saved actually drops.",
    '',
    '— Era',
  ].join('\n');

  return { subject, html, text };
}

/**
 * Send a price-drop alert. Dormant on `RESEND_API_KEY` exactly like every other
 * Era email — the shared transport owns the send / dev-log / prod-throw gate.
 *
 * When a `db` is supplied it checks the suppression list first (mirroring the
 * welcome/waitlist/deletion senders), so a hard-bounced or complained recipient
 * is skipped with a class-only log and no send. Without a `db` the check is a
 * no-op and behavior is unchanged.
 */
export async function sendPriceDropEmail(args: PriceDropEmail, deps: SendEmailDeps = {}): Promise<void> {
  const { to, db, ...content } = args;
  if (db && (await isEmailSuppressed(db, to))) {
    (deps.log ?? console.log)('[era-email] skipped price-drop email — recipient suppressed');
    return;
  }
  const { subject, html, text } = renderPriceDropEmail(content);
  await sendEmail({ to, subject, html, text }, deps);
}
