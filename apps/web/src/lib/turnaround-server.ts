/**
 * Server-only orchestration for AI turnaround views — Gemini generation + Claude
 * vision QA + persistence, behind the `@era/core` presigning helpers.
 *
 * The flow, per item:
 *   1. CLAIM a job row (insert-onConflictDoNothing; the item id IS the PK, so the
 *      claimed row — not a transaction, which neon-http lacks — is the idempotency
 *      guard). A retry re-claims a `failed` row with a single conditional update.
 *   2. Fetch the item's cutout bytes via an owner-scoped presigned GET (private).
 *   3. For all three angles CONCURRENTLY: generate a candidate (Gemini), QA it
 *      (Claude vision), and — only if accepted — upload the PNG and write an
 *      accepted render row. A rejected angle writes a row with a null imagePath
 *      and the QA note; its bytes are NEVER persisted (the cutout bucket is public
 *      via r2.dev, so an accepted row always has a path, a rejected row never does
 *      — imagePath IS NOT NULL ⟺ accepted).
 *   4. Finish: any row written → job `complete`; nothing generated at all → job
 *      `failed`. "Quality gate said no" is a complete run, not an error.
 *
 * Never import from a client bundle — it talks to the database, R2, and Claude.
 */
import Anthropic from '@anthropic-ai/sdk';
import { and, count, eq, gte, isNotNull } from 'drizzle-orm';

import { type AuthContext, estimateCostUsd, getAssetUrl, requestUploadUrl } from '@era/core';
import {
  TURNAROUND_ANGLES,
  type TurnaroundAngle,
  type TurnaroundRender,
  type TurnaroundState,
  type TurnaroundStatus,
  type TurnaroundVerdict,
  anglePrompt,
  isRenderAcceptable,
} from '@era/core/turnaround';
import {
  enabledTurnaroundCategories,
  isEraTurnaroundEnabled,
  isTurnaroundCategoryEnabled,
} from '@era/core/turnaround-flags';
import { type DbClient, type Item, aiUsage, createDbClient, itemAngleRenders, itemTurnaroundJobs } from '@era/db';

import { utcDayStart } from './ai-usage.ts';
import { generateAngleRender } from './gemini-image.ts';
import { serverStorageClient } from './storage-server.ts';

const moduleDb = createDbClient(process.env.DATABASE_URL!);

/** Cutout fetch budget — mirrors the item-pipeline raw-fetch budget. */
const CUTOUT_FETCH_TIMEOUT_MS = 6_000;
/** Cutout upload budget for an accepted render. */
const UPLOAD_TIMEOUT_MS = 8_000;
/** Claude vision QA budget — matches the item-pipeline vision stage. */
const QA_TIMEOUT_MS = 10_000;

/** The Claude model that scores each render's QA verdict. */
const QA_MODEL = 'claude-opus-4-8';
/** The Gemini model + a flat per-image cost estimate for the spend log (Gemini isn't priced by token). */
const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';
const GEMINI_IMAGE_COST_USD = 0.039;

/**
 * The `ai_usage.route` label for turnaround spend. NOT part of the `AiRoute` union
 * (those are the per-user rate-limited AI routes); turnaround has its own
 * job-based daily cap, so we insert usage rows directly rather than through
 * `recordUsage`, but keep the same row shape so the spend rollups still see them.
 */
const TURNAROUND_USAGE_ROUTE = 'turnaround';

/** Per-user daily ceiling on turnaround generation runs, counted over job rows. */
export const TURNAROUND_DAILY_LIMIT = 10;

/**
 * True only for a real, operator-supplied ANTHROPIC key. Mirrors the item-pipeline
 * guard: the committed .env.example ships `change-me…` / `sk-ant-xxxx…`
 * placeholders that would only ever fail a request.
 */
function isRealCredential(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  return !value.startsWith('change-me') && !value.startsWith('sk-ant-xxxx');
}

/**
 * Server-authoritative turnaround master flag, read raw from
 * `ERA_TURNAROUND_ENABLED` (NOT through the zod schema, so a dormant feature never
 * blocks boot — the plus-server / feed precedent). When false the turnaround API
 * routes 404 and no job is ever queued.
 */
export function isTurnaroundEnabledServer(): boolean {
  return isEraTurnaroundEnabled(process.env.ERA_TURNAROUND_ENABLED);
}

/**
 * The opt-in category narrowing from `ERA_TURNAROUND_CATEGORIES` (unset/blank →
 * null → all categories enabled). Layered under the master flag above.
 */
export function turnaroundCategories(): ReadonlySet<string> | null {
  return enabledTurnaroundCategories(process.env.ERA_TURNAROUND_CATEGORIES);
}

/**
 * Sort render rows into the canonical display order (three_quarter → side → back)
 * from {@link TURNAROUND_ANGLES}. Pure and side-effect free — the DB doesn't
 * guarantee order, and the client consumes renders in display order.
 */
export function sortRenderRowsByAngle<T extends { readonly angle: TurnaroundAngle }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => TURNAROUND_ANGLES.indexOf(a.angle) - TURNAROUND_ANGLES.indexOf(b.angle));
}

/**
 * Map Claude's forced-tool output (snake_case) onto a {@link TurnaroundVerdict}, or
 * null when unusable (missing/invalid artifact_severity). Missing booleans read as
 * false — a verdict that can't affirm "same garment" fails the gate, which is the
 * conservative default.
 */
export function coerceVerdict(input: unknown): TurnaroundVerdict | null {
  if (typeof input !== 'object' || input === null) {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const severity = raw.artifact_severity;
  if (severity !== 'none' && severity !== 'minor' && severity !== 'major') {
    return null;
  }
  return {
    sameGarment: raw.same_garment === true,
    angleMatches: raw.angle_matches === true,
    cleanBackground: raw.clean_background === true,
    artifactSeverity: severity,
  };
}

/** A compact machine reason for a rejected render, for the audit `qaNote`. */
export function rejectionNote(verdict: TurnaroundVerdict): string {
  if (!verdict.sameGarment) return 'wrong_garment';
  if (!verdict.angleMatches) return 'wrong_angle';
  if (verdict.artifactSeverity === 'major') return 'major_artifact';
  return 'dirty_background';
}

/** The per-user daily-cap decision, counted over the user's own job rows for the UTC day. */
export interface TurnaroundLimitCheck {
  readonly allowed: boolean;
  readonly used: number;
  readonly limit: number;
}

/**
 * Count today's turnaround jobs for a user and decide whether one more run is
 * allowed. Called BEFORE the claim — a false `allowed` means the route returns its
 * daily-limit response. Keyed to the same UTC-day window as the AI rate limits.
 */
export async function checkTurnaroundDailyLimit(db: DbClient, userId: string): Promise<TurnaroundLimitCheck> {
  const [row] = await db
    .select({ used: count() })
    .from(itemTurnaroundJobs)
    .where(and(eq(itemTurnaroundJobs.userId, userId), gte(itemTurnaroundJobs.createdAt, utcDayStart())));
  const used = Number(row?.used ?? 0);
  return { allowed: used < TURNAROUND_DAILY_LIMIT, used, limit: TURNAROUND_DAILY_LIMIT };
}

/**
 * Load the current turnaround state for an item: job status (`none` when no row),
 * the accepted renders (imagePath IS NOT NULL) resolved to owner-presigned display
 * URLs in display order, and whether the item's category is enabled. Angles are
 * never served publicly in v1, so each URL is an owner-scoped presigned GET.
 */
export async function getTurnaroundState(
  db: DbClient,
  ctx: AuthContext,
  userId: string,
  itemId: string,
  category: string,
): Promise<TurnaroundState> {
  const categoryEnabled = isTurnaroundCategoryEnabled(category, turnaroundCategories());

  const [job] = await db
    .select({ status: itemTurnaroundJobs.status })
    .from(itemTurnaroundJobs)
    .where(eq(itemTurnaroundJobs.itemId, itemId))
    .limit(1);
  const status: TurnaroundStatus = job ? job.status : 'none';

  const renderRows = (await db
    .select({ angle: itemAngleRenders.angle, imagePath: itemAngleRenders.imagePath })
    .from(itemAngleRenders)
    .where(and(eq(itemAngleRenders.itemId, itemId), isNotNull(itemAngleRenders.imagePath)))) as {
    angle: TurnaroundAngle;
    imagePath: string;
  }[];

  const renders: TurnaroundRender[] = await Promise.all(
    sortRenderRowsByAngle(renderRows).map(async (row): Promise<TurnaroundRender> => ({
      angle: row.angle,
      displayUrl: await getAssetUrl(serverStorageClient(), ctx, {
        bucket: 'items-cutout',
        key: row.imagePath,
        owner: { userId, isPrivate: true },
      }),
    })),
  );

  return { status, renders, categoryEnabled };
}

/** Insert one turnaround `ai_usage` row, best-effort — a spend-log miss must not fail the run. */
async function recordTurnaroundUsage(
  db: DbClient,
  userId: string,
  opts: { model: string | null; inputTokens?: number; outputTokens?: number; costUsd?: number },
): Promise<void> {
  const costUsd = opts.costUsd ?? estimateCostUsd(opts.model, opts.inputTokens, opts.outputTokens);
  try {
    await db.insert(aiUsage).values({
      userId,
      route: TURNAROUND_USAGE_ROUTE,
      model: opts.model,
      inputTokens: opts.inputTokens ?? null,
      outputTokens: opts.outputTokens ?? null,
      // cost_usd is numeric → Drizzle expects a string.
      costUsd: costUsd.toString(),
    });
  } catch (error) {
    console.error('[era-turnaround] failed to record AI usage; continuing:', error);
  }
}

/** Stamp a job as failed with an ops-facing error string. */
async function failJob(db: DbClient, itemId: string, error: string): Promise<void> {
  await db.update(itemTurnaroundJobs).set({ status: 'failed', error }).where(eq(itemTurnaroundJobs.itemId, itemId));
}

/** The QA outcome for one candidate: whether it clears the gate, and the audit note (null when clean-accepted). */
interface QaOutcome {
  readonly accepted: boolean;
  readonly qaNote: string | null;
}

/**
 * QA one candidate render against the original cutout with Claude vision. On any
 * failure (parse, timeout, API error, or a missing verdict) the render is REJECTED
 * with `qa_error` — never publish bytes no one reviewed. When ANTHROPIC is not
 * configured the verdict is skipped and the render is ACCEPTED with `qa_skipped`:
 * a dev-only condition (prod schema-requires the key), and the images are the
 * owner's own item, so shipping them unreviewed in dev is acceptable.
 */
async function qaCandidate(
  db: DbClient,
  userId: string,
  cutout: Uint8Array,
  candidate: Uint8Array,
  angle: TurnaroundAngle,
): Promise<QaOutcome> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!isRealCredential(apiKey)) {
    // Dev-only: prod schema-requires ANTHROPIC_API_KEY, so this branch cannot run
    // in production. The candidate is the owner's own garment rendered from a new
    // angle, so accepting it unreviewed in dev is safe; the note records that no
    // human/model reviewed the bytes.
    return { accepted: true, qaNote: 'qa_skipped' };
  }
  try {
    const client = new Anthropic({ apiKey, maxRetries: 1 });
    const response = await client.messages.create(
      {
        model: QA_MODEL,
        max_tokens: 1024,
        tools: [
          {
            name: 'judge_turnaround',
            description: 'Record the QA verdict comparing the generated render against the original product cutout.',
            input_schema: {
              type: 'object',
              properties: {
                same_garment: { type: 'boolean' },
                angle_matches: { type: 'boolean' },
                clean_background: { type: 'boolean' },
                artifact_severity: { type: 'string', enum: ['none', 'minor', 'major'] },
              },
              required: ['same_garment', 'angle_matches', 'clean_background', 'artifact_severity'],
            } as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: 'judge_turnaround' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'The FIRST image is the original product cutout. The SECOND image is an AI-generated render meant to show the SAME piece from a new angle. Judge the second image with the judge_turnaround tool.',
              },
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: Buffer.from(cutout).toString('base64') } },
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: Buffer.from(candidate).toString('base64') } },
              {
                type: 'text',
                text: `The render should show the garment from this viewpoint: ${anglePrompt(angle)}\nsame_garment: is it the SAME piece (color/pattern/material/proportions preserved), not a similar one? angle_matches: is it actually shown from the requested viewpoint? clean_background: is the background plain white? artifact_severity: how bad are generation artifacts (warped seams, melted hardware, extra sleeves) — none/minor/major.`,
              },
            ],
          },
        ],
      },
      { timeout: QA_TIMEOUT_MS },
    );

    await recordTurnaroundUsage(db, userId, {
      model: QA_MODEL,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    const toolUse = response.content.find((block) => block.type === 'tool_use');
    const verdict = toolUse ? coerceVerdict(toolUse.input) : null;
    if (!verdict) {
      return { accepted: false, qaNote: 'qa_error' };
    }
    return isRenderAcceptable(verdict)
      ? { accepted: true, qaNote: null }
      : { accepted: false, qaNote: rejectionNote(verdict) };
  } catch (error) {
    console.error('[era-turnaround] QA vision call failed; rejecting conservatively:', error);
    return { accepted: false, qaNote: 'qa_error' };
  }
}

/** Whether an angle produced anything: `generated` = Gemini returned bytes; `wrote` = a render row exists. */
interface AngleOutcome {
  readonly generated: boolean;
  readonly wrote: boolean;
}

/**
 * Generate, QA, and persist one angle. Records the Gemini spend only when an image
 * was actually produced (honest cost — a null candidate never hit the model's
 * output). An accepted render is uploaded then persisted with its key; a rejected
 * render — including one whose upload fails — is persisted with a null imagePath
 * and its note, and the bytes are discarded, never uploaded.
 */
async function runAngle(
  db: DbClient,
  ctx: AuthContext,
  userId: string,
  itemId: string,
  angle: TurnaroundAngle,
  cutout: Uint8Array,
): Promise<AngleOutcome> {
  const candidate = await generateAngleRender(cutout, anglePrompt(angle));
  if (!candidate) {
    return { generated: false, wrote: false };
  }
  await recordTurnaroundUsage(db, userId, { model: GEMINI_IMAGE_MODEL, costUsd: GEMINI_IMAGE_COST_USD });

  const qa = await qaCandidate(db, userId, cutout, candidate, angle);
  if (qa.accepted) {
    try {
      const { url, key } = await requestUploadUrl(serverStorageClient(), ctx, {
        bucket: 'items-cutout',
        ownerId: userId,
        ext: 'png',
        contentType: 'image/png',
      });
      const put = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: candidate as BodyInit,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
      if (!put.ok) {
        throw new Error(`cutout upload returned ${put.status}`);
      }
      await db.insert(itemAngleRenders).values({ itemId, userId, angle, imagePath: key, accepted: true, qaNote: qa.qaNote });
      return { generated: true, wrote: true };
    } catch (error) {
      console.error('[era-turnaround] accepted render upload failed; recording as rejected:', error);
      await db.insert(itemAngleRenders).values({ itemId, userId, angle, imagePath: null, accepted: false, qaNote: 'upload_failed' });
      return { generated: true, wrote: true };
    }
  }

  await db.insert(itemAngleRenders).values({ itemId, userId, angle, imagePath: null, accepted: false, qaNote: qa.qaNote });
  return { generated: true, wrote: true };
}

/** The outcome of a turnaround run — success carries the fresh state; failure carries a route-mappable code. */
export type RunTurnaroundResult =
  | { readonly ok: true; readonly state: TurnaroundState }
  | { readonly ok: false; readonly code: 'already_running' | 'generation_failed' };

/**
 * Drive a turnaround run for an item. Idempotent via the claimed job row (the item
 * id is the PK): a live `running` job → already_running; a `complete` job → the
 * current state (success); a `failed` job → re-claimed and regenerated. See the
 * module doc for the full flow.
 */
export async function runTurnaround(
  ctx: AuthContext,
  userId: string,
  item: Item,
  db: DbClient = moduleDb,
): Promise<RunTurnaroundResult> {
  const itemId = item.id;
  const category = item.category;

  // 1) CLAIM — insert the job row; the PK conflict is the concurrency guard.
  const [claimed] = await db
    .insert(itemTurnaroundJobs)
    .values({ itemId, userId, status: 'running' })
    .onConflictDoNothing()
    .returning();

  if (!claimed) {
    const [existing] = await db
      .select({ status: itemTurnaroundJobs.status })
      .from(itemTurnaroundJobs)
      .where(eq(itemTurnaroundJobs.itemId, itemId))
      .limit(1);
    if (!existing || existing.status === 'running') {
      // Another run holds the claim (or the row vanished mid-race) — don't double-generate.
      return { ok: false, code: 'already_running' };
    }
    if (existing.status === 'complete') {
      return { ok: true, state: await getTurnaroundState(db, ctx, userId, itemId, category) };
    }
    // status === 'failed' → re-claim in a single conditional update; 0 rows means
    // someone else won the retry, so back off as already_running.
    const [reclaimed] = await db
      .update(itemTurnaroundJobs)
      .set({ status: 'running', error: null })
      .where(and(eq(itemTurnaroundJobs.itemId, itemId), eq(itemTurnaroundJobs.status, 'failed')))
      .returning();
    if (!reclaimed) {
      return { ok: false, code: 'already_running' };
    }
    // Clear the prior run's render rows before regenerating (single statement).
    await db.delete(itemAngleRenders).where(eq(itemAngleRenders.itemId, itemId));
  }

  // 2) Cutout bytes. The route guards this, but guard defensively too — a job with
  //    no cutout can't generate anything.
  if (!item.imageCutoutPath) {
    await failJob(db, itemId, 'no_cutout');
    return { ok: false, code: 'generation_failed' };
  }
  let cutout: Uint8Array;
  try {
    const getUrl = await getAssetUrl(serverStorageClient(), ctx, {
      bucket: 'items-cutout',
      key: item.imageCutoutPath,
      owner: { userId, isPrivate: true },
    });
    const response = await fetch(getUrl, { signal: AbortSignal.timeout(CUTOUT_FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      throw new Error(`cutout fetch returned ${response.status}`);
    }
    cutout = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    console.error('[era-turnaround] failed to fetch cutout:', error);
    await failJob(db, itemId, 'cutout_unavailable');
    return { ok: false, code: 'generation_failed' };
  }

  // 3) Generate + QA + persist all three angles concurrently.
  const outcomes = await Promise.all(
    TURNAROUND_ANGLES.map((angle) => runAngle(db, ctx, userId, itemId, angle, cutout)),
  );

  // 4) Finish. Nothing generated at all → failed. Any row written (accepted or
  //    rejected) → complete: "we tried, the quality gate spoke" is not an error.
  const generatedAny = outcomes.some((outcome) => outcome.generated);
  if (!generatedAny) {
    await failJob(db, itemId, 'generation_failed');
    return { ok: false, code: 'generation_failed' };
  }
  await db.update(itemTurnaroundJobs).set({ status: 'complete', error: null }).where(eq(itemTurnaroundJobs.itemId, itemId));
  return { ok: true, state: await getTurnaroundState(db, ctx, userId, itemId, category) };
}
