/**
 * POST /api/wear-logs   { outfitId?, itemIds?, wornOn?, note?, lat?, lon? }
 *
 * Mark an outfit (or a bare set of items) as worn on a given day. This advances
 * the core loop, feeds Ovi's recency scoring, and fires the `wear_logged` funnel
 * event on the client (on 201). It is a cheap DB insert — no LLM cost — so it is
 * NOT metered by the ai-usage rate limiter.
 *
 * A wear log records at least one of `outfitId` / `itemIds`; both are optional
 * individually but the body must carry one of them. Everything is scoped to the
 * SESSION's own user id (never the body): a supplied `outfitId` must be the
 * caller's own outfit, and every `itemId` must name an item the caller owns, so
 * a wear log can never reference another user's wardrobe. `wornOn` defaults to
 * today (UTC). A user may log the same outfit on multiple days, so there is no
 * idempotency constraint.
 *
 * Weather snapshot: when the OPTIONAL `lat`/`lon` body fields are supplied (finite
 * numbers, lat -90..90, lon -180..180 — same coordinate contract as ovi/today,
 * which sources them from the request), the server captures current conditions
 * into the `weather` jsonb column at log time. Weather is best-effort: a fetch
 * failure or absent location NEVER fails the log — it is stored with `weather`
 * null. Coordinates are used only for the lookup, never stored.
 *
 * Responses (the contract Nova/Harbor code against — do not deviate):
 *   - 201 { wearLog: { id, outfitId, wornOn } }
 *   - 401 { error: 'unauthenticated' }   no session
 *   - 403 { error: 'forbidden' }         cross-origin browser POST
 *   - 400 { error: 'invalid' }           bad/oversized JSON body or field
 *   - 400 { error: 'empty' }             neither outfitId nor itemIds supplied
 *   - 400 { error: 'unknown_outfit' }    outfitId is not the caller's
 *   - 400 { error: 'unknown_items' }     an itemId is missing or not the caller's
 *   - 500 { error: 'save_failed' }       the insert returned no row
 *
 * GET /api/wear-logs?month=YYYY-MM
 *
 * The caller's own wear logs for that calendar month, plus the deduped set of the
 * caller's items those logs reference — feeds the calendar and the client-side
 * recap builder in @era/core. Owner-scoped by the session user id only.
 *
 * Responses:
 *   - 200 { logs: [{ id, wornOn, outfitId, itemIds, weather, note }],
 *           items: [{ id, name, category, imageUrl, purchasePrice }] }
 *   - 401 { error: 'unauthenticated' }   no session
 *   - 400 { error: 'invalid' }           `month` missing or not a real YYYY-MM
 */
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { type AssetBucket, type AuthContext, AuthzError, getAssetUrl, requireUser } from '@era/core';
import { createDbClient, outfits, profiles, wearLogs } from '@era/db';

import { auth } from '../../../lib/auth.ts';
import { allItemsOwnedBy, optionalText, parseItemIds } from '../../../lib/outfit-server.ts';
import { serverStorageClient } from '../../../lib/storage-server.ts';
import { loadWearLogsForMonth, parseMonth, resolveWearWeather } from '../../../lib/wear-logs-server.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** The body is a small JSON object; reject anything larger. */
const MAX_BODY_BYTES = 4096;
// A wear log names 1..30 items, mirroring the outfit_items contract bound.
const MIN_ITEMS = 1;
const MAX_ITEMS = 30;
// Length cap for the free-text note (Sentinel LOW: bound stored text).
const NOTE_MAX = 280;
// `worn_on` is a pg `date`; accept only the canonical calendar-date shape.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Same-origin guard for this mutating POST (same idiom as api/delete-account).
 * When a browser sends an `Origin`, its host must match the request host; a
 * mismatch is a cross-site POST and is rejected. A missing Origin (non-browser
 * clients) is allowed — the session gate is the real authorization.
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

/** Today's calendar date in UTC as `YYYY-MM-DD` — the default `wornOn`. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Validate an optional `wornOn`: absent/undefined → today (UTC); otherwise a
 * `YYYY-MM-DD` string naming a real calendar date. Returns `{ ok: false }` when
 * present but malformed so the route can answer 400. The regex bounds the shape;
 * the round-trip through Date rejects impossible dates (e.g. 2026-02-31).
 */
function parseWornOn(value: unknown): { ok: true; value: string } | { ok: false } {
  if (value === undefined) {
    return { ok: true, value: todayUtc() };
  }
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    return { ok: false };
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return { ok: false };
  }
  return { ok: true, value };
}

/**
 * Validate an OPTIONAL coordinate body field: absent/null → no coordinate (null,
 * weatherless); otherwise a finite number within ±max. Returns `{ ok: false }`
 * when present but malformed so the route can answer 400 (same range contract as
 * ovi/today's coordinate parser).
 */
function coordinate(value: unknown, max: number): { ok: true; value: number | null } | { ok: false } {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -max || value > max) {
    return { ok: false };
  }
  return { ok: true, value };
}

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Session required — userId comes from the session, never the body.
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

  // 2. Cross-origin guard + body cap.
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const rawBody = await request.text().catch(() => '');
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const root = body as Record<string, unknown>;

  // 3. Field validation. outfitId is an optional UUID; itemIds an optional
  //    de-duplicated UUID list; wornOn a calendar date (default today, UTC);
  //    note a bounded string.
  const rawOutfitId = root.outfitId;
  let outfitId: string | null = null;
  if (rawOutfitId !== undefined && rawOutfitId !== null) {
    if (typeof rawOutfitId !== 'string') {
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }
    // A non-UUID would surface as a Postgres uuid-syntax 500 — reject cleanly.
    const parsed = parseItemIds([rawOutfitId], 1, 1);
    if (!parsed) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }
    outfitId = parsed[0] ?? null;
  }

  let itemIds: string[] | null = null;
  if (root.itemIds !== undefined && root.itemIds !== null) {
    itemIds = parseItemIds(root.itemIds, MIN_ITEMS, MAX_ITEMS);
    if (!itemIds) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }
  }

  const wornOn = parseWornOn(root.wornOn);
  if (!wornOn.ok) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const note = optionalText(root, 'note', NOTE_MAX);
  if (!note.ok) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const lat = coordinate(root.lat, 90);
  const lon = coordinate(root.lon, 180);
  if (!lat.ok || !lon.ok) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  // 4. A wear log must reference something.
  if (!outfitId && !itemIds) {
    return NextResponse.json({ error: 'empty' }, { status: 400 });
  }

  // 5. Ownership: a supplied outfit must be the caller's own; every supplied
  //    item must be owned by the caller. Both are scoped by session userId, so
  //    no cross-user wardrobe can be logged.
  if (outfitId) {
    const [owned] = await db
      .select({ id: outfits.id })
      .from(outfits)
      .where(and(eq(outfits.id, outfitId), eq(outfits.userId, userId)));
    if (!owned) {
      return NextResponse.json({ error: 'unknown_outfit' }, { status: 400 });
    }
  }
  if (itemIds && !(await allItemsOwnedBy(db, userId, itemIds))) {
    return NextResponse.json({ error: 'unknown_items' }, { status: 400 });
  }

  // 6. Best-effort weather snapshot: never fails the log (null on absent
  //    location or fetch failure). Coordinates are used only for this lookup.
  const weather = await resolveWearWeather(lat.value, lon.value);

  // 7. Insert the wear log.
  const [wearLog] = await db
    .insert(wearLogs)
    .values({
      userId,
      outfitId,
      itemIds,
      wornOn: wornOn.value,
      weather,
      note: note.value ?? null,
    })
    .returning({ id: wearLogs.id, outfitId: wearLogs.outfitId, wornOn: wearLogs.wornOn });
  if (!wearLog) {
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }

  return NextResponse.json({ wearLog }, { status: 201 });
}

export async function GET(request: Request): Promise<NextResponse> {
  // 1. Session required — the owner is the session user, never a query param.
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

  // 2. Strict `YYYY-MM` month, expanded to a half-open date range.
  const range = parseMonth(new URL(request.url).searchParams.get('month'));
  if (!range) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  // 3. The owner's privacy governs whether item cutouts resolve to a public URL
  //    or a presigned GET (raw is always presigned regardless).
  const [profile] = await db
    .select({ isPrivate: profiles.isPrivate })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  const isPrivate = profile?.isPrivate ?? true;

  const { logs, items: itemRows } = await loadWearLogsForMonth(db, userId, range);

  // 4. Resolve each referenced item's display URL (cutout over raw). Presigning
  //    is local crypto (no network), so signing the set is cheap.
  const storage = serverStorageClient();
  const owner = { userId, isPrivate };
  const items = await Promise.all(
    itemRows.map(async (item) => {
      const cutout = item.imageCutoutPath;
      const key = cutout ?? item.imageRawPath;
      const bucket: AssetBucket = cutout ? 'items-cutout' : 'items-raw';
      const imageUrl = key ? await getAssetUrl(storage, ctx, { bucket, key, owner }) : null;
      return {
        id: item.id,
        name: item.name,
        category: item.category,
        imageUrl,
        purchasePrice: item.purchasePrice,
      };
    }),
  );

  return NextResponse.json({ logs, items });
}
