/**
 * POST /api/upload-url  { ext: string, contentType: string }
 *
 * Mint a short-lived presigned PUT so the client can upload a raw item image
 * straight to R2. This is a privileged action — R2 credentials live only on the
 * server — so it goes through the @era/core authz path: session → AuthContext →
 * `requireUser`, and then `requestUploadUrl`, which itself re-checks ownership
 * (`ownerOnly`) before signing. The key returned is `{userId}/{uuid}.{ext}`; the
 * client PUTs the bytes to `url`, then calls `POST /api/process-item` with that
 * key.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 400 { error: 'invalid' }          missing/blank ext or contentType, or a
 *                                        disallowed image ext / content type
 *   - 200 { url, key, expiresIn }       presigned PUT (expiresIn is seconds)
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requestUploadUrl, requireUser } from '@era/core';

import { auth } from '../../../lib/auth.ts';
import { serverStorageClient } from '../../../lib/storage-server.ts';

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

  const body: unknown = await request.json().catch(() => null);
  const ext = (body as { ext?: unknown } | null)?.ext;
  const contentType = (body as { contentType?: unknown } | null)?.contentType;
  if (typeof ext !== 'string' || ext.length === 0 || typeof contentType !== 'string' || contentType.length === 0) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  try {
    const result = await requestUploadUrl(serverStorageClient(), ctx, {
      bucket: 'items-raw',
      ownerId: userId,
      ext,
      contentType,
    });
    return NextResponse.json(result);
  } catch (error) {
    // `requestUploadUrl` throws AuthzError on an ownership failure (never for
    // this route, since ownerId === the caller) and a plain Error for a
    // disallowed ext / content type — the latter is a bad request.
    if (error instanceof AuthzError) {
      return NextResponse.json(
        { error: error.code === 'FORBIDDEN' ? 'forbidden' : 'unauthenticated' },
        { status: error.code === 'FORBIDDEN' ? 403 : 401 },
      );
    }
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
}
