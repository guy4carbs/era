/**
 * POST /api/eras   { title, description?, season? }
 * GET  /api/eras
 *
 * An era is a titled collection of outfits (a "capsule" / season board). POST
 * creates one for the caller. GET lists the caller's eras newest-first (capped),
 * each with an outfitCount and cover imagery for a card: coverUrl when the era
 * has its own cover, plus outfitCovers — the covers of its first up-to-four
 * member outfits — for a fallback collage.
 *
 * Both are session-gated (session → requireUser). Era + outfit covers both live
 * in the `outfit-covers` bucket, resolved through getAssetUrl.
 *
 * POST responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 400 { error: 'invalid' }          title missing/too long, or a bad field
 *   - 201 { era }                       the inserted eras row
 * GET responses:
 *   - 401 { error: 'unauthenticated' }
 *   - 200 { eras: [{ ...era, coverUrl, outfitCount, outfitCovers }] }
 */
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requireUser } from '@era/core';
import { createDbClient, eraOutfits, eras, outfits, profiles } from '@era/db';

import { auth } from '../../../lib/auth.ts';
import {
  ERA_DESCRIPTION_MAX,
  ERA_SEASON_MAX,
  ERA_TITLE_MAX,
  coverUrl,
  optionalText,
} from '../../../lib/outfit-server.ts';
import { livePostIdsByEra } from '../../../lib/posts-server.ts';
import { serverStorageClient } from '../../../lib/storage-server.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** Maximum eras returned per page. */
const ERAS_LIMIT = 100;
/** Member-outfit covers included per era for the fallback collage. */
const COVERS_PER_ERA = 4;

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
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const root = body as Record<string, unknown>;

  // title is required (1..80); description/season are optional.
  const title = optionalText(root, 'title', ERA_TITLE_MAX);
  const description = optionalText(root, 'description', ERA_DESCRIPTION_MAX);
  const season = optionalText(root, 'season', ERA_SEASON_MAX);
  if (!title.ok || typeof title.value !== 'string' || !description.ok || !season.ok) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const [era] = await db
    .insert(eras)
    .values({
      userId,
      title: title.value,
      description: description.value ?? null,
      season: season.value ?? null,
    })
    .returning();

  return NextResponse.json({ era }, { status: 201 });
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

  const [profile] = await db.select({ isPrivate: profiles.isPrivate }).from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const owner = { userId, isPrivate: profile?.isPrivate ?? true };

  const rows = await db
    .select()
    .from(eras)
    .where(eq(eras.userId, userId))
    .orderBy(desc(eras.createdAt))
    .limit(ERAS_LIMIT);

  const storage = serverStorageClient();

  // One pass to fetch every member outfit's cover (newest-first within an era),
  // then group per era for outfitCount + the first few covers.
  const eraIds = rows.map((e) => e.id);
  // Which of the caller's own eras are live on the feed — one batched query so
  // each card can hydrate its share toggle (unconditional: the caller's own data,
  // and the partial unique index guarantees ≤1 live post per era).
  const sharedPostIds = await livePostIdsByEra(db, eraIds);
  const memberRows = eraIds.length
    ? await db
        .select({ eraId: eraOutfits.eraId, coverImagePath: outfits.coverImagePath })
        .from(eraOutfits)
        .innerJoin(outfits, eq(eraOutfits.outfitId, outfits.id))
        .where(inArray(eraOutfits.eraId, eraIds))
        .orderBy(asc(eraOutfits.eraId), desc(outfits.createdAt))
    : [];

  const byEra = new Map<string, { count: number; covers: string[] }>();
  for (const row of memberRows) {
    const bucket = byEra.get(row.eraId) ?? { count: 0, covers: [] };
    bucket.count += 1;
    if (row.coverImagePath && bucket.covers.length < COVERS_PER_ERA) {
      bucket.covers.push(row.coverImagePath);
    }
    byEra.set(row.eraId, bucket);
  }

  const list = await Promise.all(
    rows.map(async (era) => {
      const bucket = byEra.get(era.id) ?? { count: 0, covers: [] };
      const outfitCovers = (await Promise.all(bucket.covers.map((key) => coverUrl(storage, ctx, key, owner)))).filter(
        (u): u is string => u !== null,
      );
      return {
        ...era,
        coverUrl: await coverUrl(storage, ctx, era.coverImagePath, owner),
        outfitCount: bucket.count,
        outfitCovers,
        sharedPostId: sharedPostIds.get(era.id) ?? null,
      };
    }),
  );

  return NextResponse.json({ eras: list });
}
