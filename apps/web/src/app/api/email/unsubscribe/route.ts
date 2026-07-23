/**
 * GET /api/email/unsubscribe?email=…&token=…
 *
 * The one-click unsubscribe target for The Era Edit's footer link (and the
 * List-Unsubscribe header, later). No session — a marketing recipient may have no
 * account (a waitlist joiner) — so the request is authorized by the signed token
 * bound to the address (`lib/email-links.ts`). A valid link suppresses the address
 * (`reason='manual'`, user-reversible) and, best-effort, removes it from the
 * Resend marketing audience, then 303-redirects to the calm `/email/unsubscribed`
 * page. An invalid/missing token → 400 with a plain message.
 *
 * All the logic lives in `lib/email-unsubscribe.ts` (unit-tested with injected
 * seams); this route only reads the query string and maps the result to a
 * response. GET is correct here: it's a link click, and the action is idempotent
 * (suppressing an already-suppressed address is a no-op).
 */
import { NextResponse } from 'next/server';

import { createDbClient } from '@era/db';

import { addSuppression } from '../../../../lib/email-suppression.ts';
import { removeContactFromAudience } from '../../../../lib/resend-audience.ts';
import { handleUnsubscribe } from '../../../../lib/email-unsubscribe.ts';
import { siteUrl } from '../../../../lib/site-url.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** The plain, calm message shown for a link we can't verify. */
const INVALID_MESSAGE = "This unsubscribe link isn't valid. It may have expired or been altered.";

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const email = params.get('email');
  const token = params.get('token');

  const result = await handleUnsubscribe(email, token, {
    suppress: (addr) => addSuppression(db, addr, 'manual'),
    removeFromAudience: (addr) => removeContactFromAudience({ email: addr }),
  });

  if (result.kind === 'invalid') {
    return new NextResponse(INVALID_MESSAGE, {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return NextResponse.redirect(new URL(result.path, siteUrl()), 303);
}
