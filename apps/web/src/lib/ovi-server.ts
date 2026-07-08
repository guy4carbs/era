/**
 * Server-only helpers shared by the Ovi routes: owner-scoped loading of the
 * compact styling context (profile, closet, recent wears) and the single
 * decision point between the Claude path and the deterministic fallback stylist.
 *
 * Ovi never dead-ends. When no real ANTHROPIC_API_KEY is configured — or when
 * the model errors, times out, or proposes items the caller doesn't own — this
 * falls back to `composeOutfit`, which builds a real look from the closet with
 * no model in the loop. Never import from a client bundle (pulls in the SDK).
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { and, desc, eq } from 'drizzle-orm';

import {
  OviResponseSchema,
  buildOviSystemPrompt,
  buildOviUserContext,
  composeOutfit,
  type OviIntent,
  type OviItem,
  type OviResponse,
  type StyleProfileLite,
  type WearLogLite,
  type Weather,
} from '@era/core/ovi';
import { findWardrobeGaps, type WardrobeGap } from '@era/core/shop';
import { strings } from '@era/core/strings';
import { type DbClient, items, styleProfiles, wearLogs } from '@era/db';

/** One turn of the Ovi chat, as the client sends it. */
export interface OviChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Cap on the closet we hand the stylist — plenty for a look, bounds the prompt. */
export const OVI_ITEMS_CAP = 200;
/** How many recent wears feed recency-avoidance. */
export const OVI_WEAR_LOG_LIMIT = 10;

/**
 * True only for a real, operator-supplied Anthropic key. The committed
 * `.env.example` ships obvious placeholders; treating those as configured would
 * fire a request that can only fail, so we reject them and stay deterministic.
 */
export function isRealCredential(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  return !value.startsWith('change-me') && !value.startsWith('sk-ant-xxxx');
}

/** Coerce an unknown jsonb value into a clean string array. */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * Load the caller's style profile as the lite slice Ovi reasons over, or null
 * when they haven't taken the quiz. Keywords live in the stored quiz result.
 */
export async function loadStyleProfile(db: DbClient, userId: string): Promise<StyleProfileLite | null> {
  const [row] = await db
    .select({ archetype: styleProfiles.archetype, palette: styleProfiles.palette, quizAnswers: styleProfiles.quizAnswers })
    .from(styleProfiles)
    .where(eq(styleProfiles.userId, userId))
    .limit(1);

  if (!row || !row.archetype) {
    return null;
  }
  const quiz = row.quizAnswers as { result?: { keywords?: unknown } } | null;
  return {
    archetype: row.archetype,
    palette: toStringArray(row.palette),
    keywords: toStringArray(quiz?.result?.keywords),
  };
}

/** Load the caller's non-archived closet as the compact OviItem shape (capped). */
export async function loadOviItems(db: DbClient, userId: string): Promise<OviItem[]> {
  const rows = await db
    .select({
      id: items.id,
      category: items.category,
      colors: items.colors,
      pattern: items.pattern,
      brand: items.brand,
    })
    .from(items)
    .where(and(eq(items.userId, userId), eq(items.archived, false)))
    .orderBy(desc(items.createdAt))
    .limit(OVI_ITEMS_CAP);

  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    colors: toStringArray(row.colors),
    pattern: row.pattern,
    brand: row.brand,
  }));
}

/** Load the caller's most recent wears, trimmed to what recency-avoidance needs. */
export async function loadRecentWearLogs(db: DbClient, userId: string): Promise<WearLogLite[]> {
  const rows = await db
    .select({ itemIds: wearLogs.itemIds, wornOn: wearLogs.wornOn })
    .from(wearLogs)
    .where(eq(wearLogs.userId, userId))
    .orderBy(desc(wearLogs.wornOn))
    .limit(OVI_WEAR_LOG_LIMIT);

  return rows.map((row) => ({ itemIds: row.itemIds ?? [], wornOn: row.wornOn }));
}

/** Ovi's deterministic "what am I missing?" turn: the engine's gaps + her narration. */
export interface WhatsMissingResult {
  reply: string;
  gaps: readonly WardrobeGap[];
}

/**
 * Compose Ovi's "what am I missing?" turn — fully deterministic, no model in the
 * loop. The gaps come from {@link findWardrobeGaps} (the same engine the Shop
 * gaps route uses), and Ovi's copy is built AROUND them from Quill's strings: the
 * honest lead-in, then one truthful sentence per gap. A covered closet yields no
 * gaps and the warm empty line. The returned `gaps` carry each pre-filtered
 * `suggestedQuery`, so the client can render tappable "fill this gap" actions.
 */
export function styleWhatsMissing(input: {
  items: OviItem[];
  profile: StyleProfileLite | null;
  wearLogs: WearLogLite[];
}): WhatsMissingResult {
  const gaps = findWardrobeGaps(input.items, input.profile, input.wearLogs);
  const copy = strings.shop.gaps;
  if (gaps.length === 0) {
    return { reply: copy.empty, gaps };
  }
  const lines = gaps.map((gap) => copy.reason(gap));
  return { reply: [copy.oviIntro, ...lines].join('\n\n'), gaps };
}

/**
 * Load the caller's genuine wardrobe gaps — owner-scoped and deterministic (no
 * model, nothing metered). Loads their own closet, style profile, and recent
 * wears (each already filtered by `userId`) and runs the model-free gap engine.
 * This is the delegate `POST /api/wardrobe-gaps` returns; the Ovi chat route runs
 * {@link findWardrobeGaps} directly on the closet it already loaded.
 */
export async function loadWardrobeGaps(db: DbClient, userId: string): Promise<readonly WardrobeGap[]> {
  const [profile, closet, recentWears] = await Promise.all([
    loadStyleProfile(db, userId),
    loadOviItems(db, userId),
    loadRecentWearLogs(db, userId),
  ]);
  return findWardrobeGaps(closet, profile, recentWears);
}

/** Everything the stylist needs for one turn, owner-loaded and coarse-weathered. */
export interface OviStyleRequest {
  intent: OviIntent;
  messages: OviChatMessage[];
  profile: StyleProfileLite | null;
  items: OviItem[];
  wearLogs: WearLogLite[];
  weather: Weather | null;
  itemContext: string | null;
}

/**
 * Validate a model proposal against the caller's real closet: drop any item id
 * the caller doesn't own. If a styling proposal empties out, return null so the
 * caller falls back to the deterministic stylist rather than ship an empty look.
 */
function validateProposal(response: OviResponse, knownIds: ReadonlySet<string>): OviResponse | null {
  if (!response.outfit) {
    return response;
  }
  const itemIds = response.outfit.itemIds.filter((id) => knownIds.has(id));
  if (itemIds.length === 0) {
    return null;
  }
  return { reply: response.reply, outfit: { ...response.outfit, itemIds } };
}

/** The Claude model Ovi styles with — single-sourced for the request and its usage log. */
const OVI_MODEL = 'claude-opus-4-8';

/** Model + token counts from a real Claude styling turn, for the AI spend log. */
export interface OviUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Ask Claude for a styled response. Returns the validated OviResponse alongside
 * its token usage, or null on any failure (parse, timeout, API error) or a
 * proposal that references no real item — the caller then uses the deterministic
 * stylist. Errors are logged server-side only; the key is never logged or leaked.
 */
async function styleWithLlm(apiKey: string, request: OviStyleRequest): Promise<{ response: OviResponse; usage: OviUsage } | null> {
  try {
    const client = new Anthropic({ apiKey, maxRetries: 1 });
    const context = buildOviUserContext({
      intent: request.intent,
      message: '',
      profile: request.profile,
      items: request.items,
      wearLogs: request.wearLogs,
      weather: request.weather,
      itemContext: request.itemContext,
    });

    const response = await client.messages.parse(
      {
        model: OVI_MODEL,
        max_tokens: 1024,
        system: buildOviSystemPrompt(request.profile, request.weather),
        // OviResponseSchema is a zod v3 schema (core pins zod ^3); the SDK helper's
        // types expect zod v4. Cast at this boundary rather than widen the schema —
        // the runtime schema is unchanged. Mirrors the derive-style-profile route.
        output_config: { format: zodOutputFormat(OviResponseSchema as never), effort: 'low' },
        messages: [{ role: 'user', content: context }, ...request.messages],
      },
      { timeout: 15_000 },
    );

    const parsed = (response.parsed_output as OviResponse | null) ?? null;
    if (!parsed) {
      return null;
    }
    const validated = validateProposal(parsed, new Set(request.items.map((item) => item.id)));
    if (!validated) {
      return null;
    }
    return {
      response: validated,
      usage: { model: OVI_MODEL, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    };
  } catch (error) {
    console.error('[ovi] LLM styling failed; falling back to the deterministic stylist:', error);
    return null;
  }
}

/** Which path produced the response we returned. */
export type OviSource = 'llm' | 'deterministic';

/** A styled turn plus its provenance; `usage` is present only on the LLM path. */
export interface OviStyleResult {
  response: OviResponse;
  source: OviSource;
  usage?: OviUsage;
}

/**
 * Style one turn: Claude when a real key is configured and it returns a valid,
 * closet-grounded look, otherwise the deterministic stylist. Always resolves to
 * a real response — this is the method both Ovi routes call. On the LLM path the
 * result carries `usage` so the caller can log real spend; the deterministic
 * path omits it (nothing to price).
 */
export async function styleWithOvi(request: OviStyleRequest): Promise<OviStyleResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (isRealCredential(apiKey)) {
    const llm = await styleWithLlm(apiKey, request);
    if (llm) {
      return { response: llm.response, source: 'llm', usage: llm.usage };
    }
  }
  return {
    response: composeOutfit({
      intent: request.intent,
      items: request.items,
      profile: request.profile,
      weather: request.weather,
      itemContext: request.itemContext,
      wearLogs: request.wearLogs,
    }),
    source: 'deterministic',
  };
}
