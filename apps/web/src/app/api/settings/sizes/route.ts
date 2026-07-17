/**
 * Read / update the caller's saved sizes — prefilled (and editable) at checkout.
 *
 *   GET /api/settings/sizes
 *     → { apparelSize, denimSize, shoeSize }   (all null if no row)
 *   PUT /api/settings/sizes
 *     { apparelSize?, denimSize?, shoeSize? }   (each a valid size string, or null to clear)
 *     → the full updated sizes
 *
 * Owner-scoped end to end: `userId` is ALWAYS the session's, never the body. This is
 * user data, NOT the checkout feature — so it is deliberately NOT gated on
 * `ERA_CHECKOUT_ENABLED` (no 404); it is only ever linked from the checkout UI.
 * Session-gated (401), same-origin on the mutating verb (403), body-capped +
 * validated against the size vocabulary (400).
 *
 * Each field is validated against its OWN size subset — apparel (XS–XL), denim waist
 * (24–32), EU shoe (37–42) — mirrored here from `@era/core/shop`'s SIZE_OPTIONS (which
 * keeps those subsets module-private), the same "mirror the enum for validation" idiom
 * as `shop-query.ts`. PUT is a PATCH: an absent field is left untouched; an explicit
 * null clears it.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 403 { error: 'forbidden' }        cross-origin (PUT)
 *   - 400 { error: 'invalid' }          body failed validation
 *   - 200 sizes
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requireUser } from '@era/core';
import { createDbClient, userSizes } from '@era/db';
import { eq } from 'drizzle-orm';

import { auth } from '../../../../lib/auth.ts';
import { isSameOrigin } from '../../../../lib/shop-query.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** A tiny object — a handful of short size tokens. */
const MAX_BODY_BYTES = 4 * 1024;

/**
 * The three size subsets, mirrored from `@era/core/shop`'s SIZE_OPTIONS (apparel /
 * denim / shoe). shop.ts keeps these arrays module-private, so — like `shop-query.ts`
 * mirrors the item-category enum — we mirror them here for server-side validation.
 * Each saved size must belong to its own dimension's set.
 */
const APPAREL_SIZES = new Set(['XS', 'S', 'M', 'L', 'XL']);
const DENIM_SIZES = new Set(['24', '26', '28', '30', '32']);
const SHOE_SIZES = new Set(['37', '38', '39', '40', '41', '42']);

const SIZE_FIELDS = [
  ['apparelSize', APPAREL_SIZES],
  ['denimSize', DENIM_SIZES],
  ['shoeSize', SHOE_SIZES],
] as const;

type SizeField = (typeof SIZE_FIELDS)[number][0];
type SizesPatch = Partial<Record<SizeField, string | null>>;

/** Resolve the caller's id, or a 401. */
async function authenticate(request: Request): Promise<{ userId: string } | NextResponse> {
  const sessionResult = await auth.api.getSession({ headers: request.headers });
  const ctx: AuthContext = { userId: sessionResult?.user.id ?? null };
  try {
    return { userId: requireUser(ctx) };
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    throw error;
  }
}

/** Read the capped JSON object body, or null (→ 400). */
async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return null;
  }
  const rawBody = await request.text().catch(() => '');
  if (rawBody.length > MAX_BODY_BYTES) {
    return null;
  }
  let body: unknown;
  try {
    body = rawBody.length > 0 ? JSON.parse(rawBody) : {};
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  return body as Record<string, unknown>;
}

/**
 * Parse the size patch, or null (→ 400). A present field must be null (clear) or a
 * string in its OWN subset; an absent field is omitted (left untouched by the upsert).
 */
function parsePatch(body: Record<string, unknown>): SizesPatch | null {
  const patch: SizesPatch = {};
  for (const [key, set] of SIZE_FIELDS) {
    if (!(key in body)) continue;
    const value = body[key];
    if (value === null) {
      patch[key] = null;
      continue;
    }
    if (typeof value !== 'string' || !set.has(value)) {
      return null;
    }
    patch[key] = value;
  }
  return patch;
}

/** The current sizes for a user (all null when no row). */
async function loadSizes(userId: string): Promise<{ apparelSize: string | null; denimSize: string | null; shoeSize: string | null }> {
  const [row] = await db
    .select({ apparelSize: userSizes.apparelSize, denimSize: userSizes.denimSize, shoeSize: userSizes.shoeSize })
    .from(userSizes)
    .where(eq(userSizes.userId, userId))
    .limit(1);
  return { apparelSize: row?.apparelSize ?? null, denimSize: row?.denimSize ?? null, shoeSize: row?.shoeSize ?? null };
}

export async function GET(request: Request): Promise<NextResponse> {
  const authed = await authenticate(request);
  if (authed instanceof NextResponse) {
    return authed;
  }
  return NextResponse.json(await loadSizes(authed.userId), { status: 200 });
}

export async function PUT(request: Request): Promise<NextResponse> {
  const authed = await authenticate(request);
  if (authed instanceof NextResponse) {
    return authed;
  }
  const { userId } = authed;

  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await readBody(request);
  if (!body) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const patch = parsePatch(body);
  if (!patch) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  // Upsert: on INSERT the absent fields default to null; on CONFLICT only the fields
  // the patch supplies are written, so a single-size capture never wipes the others.
  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const [key] of SIZE_FIELDS) {
    if (key in patch) {
      set[key] = patch[key] ?? null;
    }
  }
  await db
    .insert(userSizes)
    .values({
      userId,
      apparelSize: patch.apparelSize ?? null,
      denimSize: patch.denimSize ?? null,
      shoeSize: patch.shoeSize ?? null,
    })
    .onConflictDoUpdate({ target: userSizes.userId, set });

  return NextResponse.json(await loadSizes(userId), { status: 200 });
}
