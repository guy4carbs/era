/**
 * POST /api/outfits/cover-url  { ext, contentType }
 *
 * Mint a short-lived presigned PUT so the client can upload an exported outfit
 * cover straight to the `outfit-covers` R2 bucket. Mirrors /api/upload-url but
 * targets covers instead of raw item images. The key returned is
 * `{userId}/{uuid}.{ext}`; the client PUTs the exported image to `url`, then
 * PATCHes the outfit with `coverImagePath = key`.
 *
 * Presigning is server-only (R2 credentials never reach a client), so it goes
 * through the @era/core authz path: session → requireUser → requestUploadUrl,
 * which re-checks ownership before signing.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 400 { error: 'invalid' }          missing/blank or disallowed ext/contentType
 *   - 200 { url, key, expiresIn }       presigned PUT (expiresIn is seconds)
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requestUploadUrl, requireUser } from '@era/core';

import { auth } from '../../../../lib/auth.ts';
import { serverStorageClient } from '../../../../lib/storage-server.ts';

// Cover uploads accept the same still-image types as item uploads.
const ALLOWED_EXT = new Set(['png', 'jpg', 'jpeg', 'webp']);

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
  if (
    typeof ext !== 'string' ||
    !ALLOWED_EXT.has(ext.toLowerCase()) ||
    typeof contentType !== 'string' ||
    contentType.length === 0
  ) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  try {
    const result = await requestUploadUrl(serverStorageClient(), ctx, {
      bucket: 'outfit-covers',
      ownerId: userId,
      ext,
      contentType,
    });
    return NextResponse.json(result);
  } catch (error) {
    // requestUploadUrl throws AuthzError on ownership (never here — ownerId is
    // the caller) and a plain Error for a disallowed ext / content type.
    if (error instanceof AuthzError) {
      return NextResponse.json(
        { error: error.code === 'FORBIDDEN' ? 'forbidden' : 'unauthenticated' },
        { status: error.code === 'FORBIDDEN' ? 403 : 401 },
      );
    }
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
}
