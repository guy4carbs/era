/**
 * Delivery of the passwordless magic-link email for Era's sign-in flow.
 *
 * This is the ONE place the magic link becomes an email. `lib/auth.ts`'s
 * `magicLink.sendMagicLink` delegates straight here; the activation branching
 * (send / dev-log / prod-throw) lives here so it is unit-testable in isolation
 * without instantiating Better Auth or a DB client.
 *
 * Dormant-credential pattern (mirrors `lib/auth.ts` OAuth + `lib/shop-provider.ts`):
 *   - A real, operator-supplied `RESEND_API_KEY` engages the provider and the
 *     link is emailed via Resend — in BOTH dev and prod.
 *   - No real key + production → fail loudly (the deploy is misconfigured; a
 *     placeholder must never masquerade as a wired provider).
 *   - No real key + dev → emit the single greppable console line so local
 *     sign-in works with no email provider. Gauge's E2E reads that exact format.
 *
 * Security posture (see the repo's Security section):
 *   - `RESEND_API_KEY` and `EMAIL_FROM` are read from the server environment
 *     ONLY; nothing here reaches a client bundle.
 *   - The magic-link URL and the API key are secrets. They are NEVER logged in
 *     production and NEVER placed in a thrown Error message — a failed send
 *     surfaces a fixed message plus the HTTP status only, so Better Auth can
 *     react without anything sensitive leaking into logs or responses.
 */

/** Resend's transactional send endpoint. Pinned in code — never user-derived. */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** Default sender when `EMAIL_FROM` is unset. A verified Era domain address. */
const DEFAULT_FROM = 'Era <hello@era.style>';

/** The magic link to deliver, plus the recipient. */
export interface MagicLinkEmail {
  readonly email: string;
  readonly url: string;
}

/**
 * Injectable seams for testing: the env source, the `fetch` used to reach
 * Resend, and the dev-log sink. All default to the real process globals so
 * production callers pass nothing.
 */
export interface SendMagicLinkDeps {
  readonly env?: Record<string, string | undefined>;
  readonly fetchImpl?: typeof fetch;
  readonly log?: (message: string) => void;
}

/**
 * True only for a real, operator-supplied Resend key. The committed
 * `.env.example` ships an obvious `change-me-…` placeholder; treating that as
 * configured would fire an authenticated request that can only fail (and, in
 * prod, hide the fact that the key was never set). Same placeholder-guard idiom
 * as `lib/auth.ts` and `lib/shop-provider.ts`.
 */
export function isRealCredential(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  return !value.startsWith('change-me');
}

/**
 * Deliver (or, in dev without a provider, log) the magic link.
 *
 * Resolves once the link has been handed off — a Resend 2xx, or the dev console
 * line. Rejects when a wired provider returns non-2xx, or in production with no
 * provider wired; Better Auth surfaces the rejection to the caller. The
 * rejection NEVER carries the url or the key.
 */
export async function sendMagicLinkEmail(
  { email, url }: MagicLinkEmail,
  deps: SendMagicLinkDeps = {},
): Promise<void> {
  const env = deps.env ?? process.env;
  const apiKey = env.RESEND_API_KEY;

  if (isRealCredential(apiKey)) {
    const from = env.EMAIL_FROM?.trim() ? env.EMAIL_FROM : DEFAULT_FROM;
    const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
    await deliverViaResend({ apiKey, from, email, url }, fetchImpl);
    return;
  }

  // No real key. In production this is a misconfiguration — fail loudly, and
  // NEVER log the url. In dev, emit the single greppable line so local sign-in
  // works without any email provider (Gauge's E2E depends on this exact format).
  if (env.NODE_ENV === 'production') {
    throw new Error('email provider not wired yet');
  }
  const log = deps.log ?? console.log;
  log(`[era-auth] magic link for ${email}: ${url}`);
}

/** The fields a single Resend send needs, all resolved by the caller. */
interface ResendSend {
  readonly apiKey: string;
  readonly from: string;
  readonly email: string;
  readonly url: string;
}

/**
 * POST the rendered email to Resend. Throws a fixed, secret-free message on a
 * non-2xx response (status only — never the response body, which we don't echo,
 * and never the url/key). A network-level fetch rejection propagates as-is; it
 * carries no Era secret.
 */
async function deliverViaResend({ apiKey, from, email, url }: ResendSend, fetchImpl: typeof fetch): Promise<void> {
  const { subject, html, text } = renderEmail(url);

  const response = await fetchImpl(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: email, subject, html, text }),
  });

  if (!response.ok) {
    // Status is safe to surface; the body is not echoed (it cannot contain our
    // key, but the fixed message keeps the failure path uniform and leak-proof).
    throw new Error(`failed to send magic link email (status ${response.status})`);
  }
}

/** Era's magic-link email — warm, understated, one clear action. */
function renderEmail(url: string): { subject: string; html: string; text: string } {
  const subject = 'Your sign-in link for Era';

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
              <td style="font-size:16px;line-height:1.6;padding-bottom:28px;">
                Welcome back. Tap the button below to sign in — the link expires shortly and can only be used once.
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:28px;">
                <a href="${url}" style="display:inline-block;background:#1c1b1a;color:#faf9f7;text-decoration:none;font-size:15px;font-weight:500;padding:13px 28px;border-radius:10px;">Sign in to Era</a>
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;line-height:1.6;color:#6b6864;padding-bottom:8px;">
                Or paste this link into your browser:
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;line-height:1.6;color:#6b6864;word-break:break-all;padding-bottom:28px;">
                <a href="${url}" style="color:#6b6864;">${url}</a>
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;line-height:1.6;color:#9a9691;border-top:1px solid #ecebe8;padding-top:20px;">
                If you didn't ask to sign in, you can safely ignore this email — nothing will happen.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    'Welcome back to Era.',
    '',
    'Tap the link below to sign in. It expires shortly and can only be used once.',
    '',
    url,
    '',
    "If you didn't ask to sign in, you can safely ignore this email.",
    '',
    '— Era',
  ].join('\n');

  return { subject, html, text };
}
