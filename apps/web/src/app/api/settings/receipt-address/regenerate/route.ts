/**
 * POST /api/settings/receipt-address/regenerate
 *
 * Rotate the caller's inbound-receipt address: revoke the old token and mint a
 * fresh one. Rotation is a HARD kill — the old address stops resolving the instant
 * the new one is minted (the reason to rotate is usually a leaked address). Session-
 * gated, same-origin (mutating verb), and owner-scoped: the `userId` is ALWAYS the
 * session's, and the write is authorized through `@era/core`'s
 * `canRevokeReceiptInboxToken` + `canInsertReceiptInboxToken` guards.
 *
 * There is no interactive transaction (the Neon HTTP driver has none); the revoke-
 * before-mint order plus the `receipt_inbox_tokens` active-user partial unique
 * index are what keep "exactly one active token" true, including under a race.
 *
 * When inbound receipts are unconfigured the feature is dormant: the response is
 * `{ address: null, dormant: true }` and NO token is touched.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }              no session
 *   - 403 { error: 'forbidden' }                    cross-origin / non-owner
 *   - 200 { address: string | null, dormant: boolean }
 */
import { NextResponse } from 'next/server';

import {
  type AuthContext,
  AuthzError,
  canInsertReceiptInboxToken,
  canRevokeReceiptInboxToken,
  requireUser,
} from '@era/core';
import { createDbClient } from '@era/db';

import { auth } from '../../../../../lib/auth.ts';
import { isRealCredential } from '../../../../../lib/send-email.ts';
import { composeReceiptAddress, regenerateActiveToken } from '../../../../../lib/receipt-inbox.ts';
import { isSameOrigin } from '../../../../../lib/shop-query.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** True when inbound receipts are provisioned (domain + webhook secret both real). */
function inboundConfigured(env: Record<string, string | undefined>): boolean {
  return isRealCredential(env.INBOUND_EMAIL_DOMAIN) && isRealCredential(env.RESEND_INBOUND_WEBHOOK_SECRET);
}

export async function POST(request: Request): Promise<NextResponse> {
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

  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    canRevokeReceiptInboxToken(ctx, { userId });
    canInsertReceiptInboxToken(ctx, { userId });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    throw error;
  }

  const domain = process.env.INBOUND_EMAIL_DOMAIN;
  if (!inboundConfigured(process.env) || domain === undefined) {
    // Dormant: nothing to rotate, and no address to compose.
    return NextResponse.json({ address: null, dormant: true }, { status: 200 });
  }

  const token = await regenerateActiveToken(db, userId);
  return NextResponse.json({ address: composeReceiptAddress(token, domain), dormant: false }, { status: 200 });
}
