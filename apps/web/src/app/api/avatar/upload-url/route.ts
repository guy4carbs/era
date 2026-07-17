/**
 * POST /api/avatar/upload-url  { ext: string, contentType: string }
 *
 * Mint a short-lived presigned PUT so a consented Era+ user can upload one avatar
 * SOURCE photo straight into the private avatars bucket under their transient
 * `${userId}/avatar-src/` prefix. R2 credentials live only on the server, so this
 * goes through the @era/core authz path (`requestUploadUrl` re-checks ownership
 * before signing). The client PUTs the bytes, then calls `POST /api/avatar` with
 * the returned keys.
 *
 * DORMANT behind `ERA_TRYON_ENABLED` (404 while off). This is a plus-gated write —
 * building an avatar is an Era+ feature — so the gate order is:
 *   flag → session → same-origin → Era+ → validation → sign.
 *
 * Responses:
 *   - 404 { error: 'not_found' }        feature dormant
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 403 { error: 'forbidden' }        cross-origin POST
 *   - 403 { error: 'plus_required' }    not an Era+ subscriber
 *   - 400 { error: 'invalid' }          missing/blank or disallowed ext/contentType
 *   - 200 { url, key }                  presigned PUT + the key to PUT to
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requestUploadUrl } from '@era/core';
import { createDbClient } from '@era/db';

import { auth } from '../../../../lib/auth.ts';
import { getUserPlusState } from '../../../../lib/plus-server.ts';
import { isSameOrigin } from '../../../../lib/shop-query.ts';
import { serverStorageClient } from '../../../../lib/storage-server.ts';
import { isTryonEnabledServer } from '../../../../lib/tryon-server.ts';

const db = createDbClient(process.env.DATABASE_URL!);

export async function POST(request: Request): Promise<NextResponse> {
  if (!isTryonEnabledServer()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user.id;
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const plus = await getUserPlusState(db, userId);
  if (!plus.isPlus) {
    return NextResponse.json({ error: 'plus_required' }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);
  const ext = (body as { ext?: unknown } | null)?.ext;
  const contentType = (body as { contentType?: unknown } | null)?.contentType;
  if (typeof ext !== 'string' || ext.length === 0 || typeof contentType !== 'string' || contentType.length === 0) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const ctx: AuthContext = { userId };
  try {
    const { url, key } = await requestUploadUrl(serverStorageClient(), ctx, {
      bucket: 'avatars',
      ownerId: userId,
      ext,
      contentType,
      subdir: 'avatar-src',
    });
    return NextResponse.json({ url, key });
  } catch (error) {
    // requestUploadUrl throws AuthzError only on an ownership mismatch (never here,
    // ownerId === caller) and a plain Error for a disallowed ext / content type.
    if (error instanceof AuthzError) {
      return NextResponse.json(
        { error: error.code === 'FORBIDDEN' ? 'forbidden' : 'unauthenticated' },
        { status: error.code === 'FORBIDDEN' ? 403 : 401 },
      );
    }
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
}
