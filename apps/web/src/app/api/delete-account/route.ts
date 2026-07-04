/**
 * POST /api/delete-account   { confirmEmail: string }
 *
 * Irreversible, full-account deletion — the App Store account-deletion
 * requirement and the GDPR right-to-erasure. The done-criterion is "zero rows,
 * zero storage objects". This is the single most destructive endpoint in the
 * app, so every deletion is scoped to the SESSION's own user id: `userId` comes
 * from the authenticated session and NEVER from the request body, so a caller
 * can only ever delete their own account. `confirmEmail` is defense-in-depth
 * (a typed confirmation), not the authorization.
 *
 * Ordering — storage FIRST, then the database:
 *   1. Delete every R2 object under `${userId}/` across all buckets, while we
 *      still hold a valid session/userId. If this throws, the DB is left
 *      untouched → 500 and the user can safely retry (nothing half-deleted).
 *   2. Delete the Better Auth `user` row. Its FK graph is ON DELETE CASCADE, so
 *      this tears down session, account, profiles, style_profiles, items,
 *      outfits→outfit_items, eras→era_outfits, wear_logs, follows, ai_events.
 *      Deleting the session rows server-side invalidates the caller's session;
 *      the client also calls signOut() and clears its cookie.
 *   3. Delete the non-cascading, EMAIL-keyed traces (waitlist, verification),
 *      which are not FK-linked to user.id.
 *
 * Responses (the contract Nova/Harbor code against — do not deviate):
 *   - 200 { deleted: true, storageObjectsDeleted: number }
 *   - 401 { error: 'unauthenticated' }      no session
 *   - 403 { error: 'forbidden' }            cross-origin browser POST
 *   - 400 { error: 'confirmation_mismatch' } confirmEmail !== session email
 *   - 400 { error: 'invalid' }              bad/oversized JSON body
 *   - 500 { error: 'deletion_failed' }      storage or DB error
 */
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, deleteUserObjects, requireUser } from '@era/core';
import { createDbClient, user, verification, waitlist } from '@era/db';

import { auth } from '../../../lib/auth.ts';
import { serverStorageClient } from '../../../lib/storage-server.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** The body is a tiny JSON object; reject anything larger. */
const MAX_BODY_BYTES = 1024;

/**
 * Same-origin guard for this mutating POST (same idiom as api/waitlist). When a
 * browser sends an `Origin`, its host must match the request host; a mismatch
 * is a cross-site POST and is rejected. A missing Origin (non-browser clients)
 * is allowed — the session gate below is the real authorization.
 */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const host = request.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Session required — userId AND email come from the session, never the body.
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
  const sessionEmail = sessionResult?.user.email ?? '';

  // 2. Cross-origin guard + body cap.
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const raw = await request.text().catch(() => '');
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const confirmEmail = (body as { confirmEmail?: unknown } | null)?.confirmEmail;
  if (typeof confirmEmail !== 'string') {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  // 3. Typed-confirmation check (case-insensitive, trimmed). Defense-in-depth;
  //    the session is the real authz — this only guards against a fat-finger.
  if (confirmEmail.trim().toLowerCase() !== sessionEmail.trim().toLowerCase()) {
    return NextResponse.json({ error: 'confirmation_mismatch' }, { status: 400 });
  }

  // 4. Delete storage FIRST, while the session/userId is still valid. On any
  //    AWS error, abort BEFORE touching the DB so the account stays intact and
  //    the user can retry (deleteUserObjects never does a partial-then-swallow).
  let storageObjectsDeleted: number;
  try {
    ({ deleted: storageObjectsDeleted } = await deleteUserObjects(serverStorageClient(), userId));
  } catch {
    // No PII in the log — never print the email.
    console.error(`delete-account: storage delete failed for user ${userId}`);
    return NextResponse.json({ error: 'deletion_failed' }, { status: 500 });
  }

  // 5-6. Delete DB rows. Deleting the user row cascades every user_id-keyed
  //    domain table (session, account, profiles, style_profiles, items,
  //    outfits→outfit_items, eras→era_outfits, wear_logs, follows, ai_events).
  //    waitlist and verification are NOT FK-linked to user.id — they are keyed
  //    by email — so we delete them explicitly. verification is Better Auth's
  //    ephemeral email-token table (identifier = the email for magic-link);
  //    any stragglers expire on their own, so an exact identifier match is a
  //    best-effort cleanup, not a correctness requirement.
  //
  //    NOTE: storage is already gone by this point. If a DB delete fails we
  //    still return 500, but a retry re-runs the cascade idempotently (the
  //    caller wanted deletion, and re-listing an already-empty prefix is a
  //    no-op), so a retry converges on the zero-rows/zero-objects end state.
  try {
    if (sessionEmail.length > 0) {
      await db.delete(waitlist).where(eq(waitlist.email, sessionEmail));
      await db.delete(verification).where(eq(verification.identifier, sessionEmail));
    }
    // 7. Session invalidation relies on this cascade: deleting the user row
    //    removes its `session` rows, so the server-side session is gone. The
    //    client completes the sign-out (signOut() + cookie clear).
    await db.delete(user).where(eq(user.id, userId));
  } catch {
    console.error(`delete-account: db delete failed for user ${userId} (storage already deleted)`);
    return NextResponse.json({ error: 'deletion_failed' }, { status: 500 });
  }

  return NextResponse.json({ deleted: true, storageObjectsDeleted });
}
