/**
 * GET /api/settings/receipt-address
 *
 * The caller's private inbound-receipt address — `u_<token>@<INBOUND_EMAIL_DOMAIN>`
 * — for the Settings surface. Session-gated and owner-scoped: the `userId` is
 * ALWAYS the session's, and the read is authorized through `@era/core`'s
 * `canReadReceiptInboxToken` guard.
 *
 * The feature is DORMANT until inbound receipts are provisioned server-side. When
 * either `INBOUND_EMAIL_DOMAIN` or `RESEND_INBOUND_WEBHOOK_SECRET` is unconfigured
 * (unset / `change-me-…` placeholder) the response is `{ address: null,
 * dormant: true }` and NO token is minted — there is no address to hand out yet.
 * When configured, the first GET lazily mints the user's one active token (mint-
 * once: a second GET returns the same address).
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }              no session
 *   - 403 { error: 'forbidden' }                    non-owner (defensive)
 *   - 200 { address: string | null, dormant: boolean }
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, canReadReceiptInboxToken, requireUser } from '@era/core';
import { createDbClient } from '@era/db';

import { auth } from '../../../../lib/auth.ts';
import { isRealCredential } from '../../../../lib/send-email.ts';
import { composeReceiptAddress, getOrCreateActiveToken } from '../../../../lib/receipt-inbox.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** True when inbound receipts are provisioned (domain + webhook secret both real). */
function inboundConfigured(env: Record<string, string | undefined>): boolean {
  return isRealCredential(env.INBOUND_EMAIL_DOMAIN) && isRealCredential(env.RESEND_INBOUND_WEBHOOK_SECRET);
}

export async function GET(request: Request): Promise<NextResponse> {
  const sessionResult = await auth.api.getSession({ headers: request.headers });
  const ctx: AuthContext = { userId: sessionResult?.user.id ?? null };

  let userId: string;
  try {
    userId = requireUser(ctx);
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    throw error;
  }

  try {
    canReadReceiptInboxToken(ctx, { userId });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    throw error;
  }

  const domain = process.env.INBOUND_EMAIL_DOMAIN;
  if (!inboundConfigured(process.env) || domain === undefined) {
    return NextResponse.json({ address: null, dormant: true }, { status: 200 });
  }

  const token = await getOrCreateActiveToken(db, userId);
  return NextResponse.json({ address: composeReceiptAddress(token, domain), dormant: false }, { status: 200 });
}
