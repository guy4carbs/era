/**
 * Ovi chat + styling endpoint.
 *
 *   POST /api/ovi-chat  { messages, intent?, itemContext?, location? }
 *
 * The client sends the conversation so far plus an optional intent, a focal
 * item (for "style this piece"), and coarse coordinates (for weather). The
 * server loads the caller's own closet, style profile, and recent wears, then
 * styles a reply: Claude when a real ANTHROPIC_API_KEY is configured, otherwise
 * the deterministic stylist. Either way the reply is grounded in real closet
 * items — the request never fails because the model did, and never proposes an
 * item the caller doesn't own.
 *
 * Coordinates are used only to look up weather and are never stored.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 400 { error: 'invalid' }          body failed validation
 *   - 200 { reply, outfit, source, weather }
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requireUser } from '@era/core';
import type { OviIntent } from '@era/core/ovi';
import { strings } from '@era/core/strings';
import { createDbClient } from '@era/db';

import { auth } from '../../../lib/auth.ts';
import { checkDailyLimit, checkGlobalAiGate, recordUsage } from '../../../lib/ai-usage.ts';
import { fetchWeather } from '../../../lib/weather.ts';
import {
  type OviChatMessage,
  loadOviItems,
  loadRecentWearLogs,
  loadStyleProfile,
  styleWithOvi,
} from '../../../lib/ovi-server.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** The intents the client may ask for; anything else is rejected. */
const OVI_INTENTS: readonly OviIntent[] = ['style_for', 'today', 'style_item', 'whats_missing', 'chat'];

/** Bounds on the conversation the client may submit (Sentinel: bound stored text). */
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2000;
const MAX_ITEM_CONTEXT_CHARS = 100;

/** A coarse coordinate for the weather lookup. */
interface Location {
  lat: number;
  lon: number;
}

/** Parse and bound the chat history, or null when it is malformed. */
function parseMessages(value: unknown): OviChatMessage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) {
    return null;
  }
  const out: OviChatMessage[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) {
      return null;
    }
    const { role, content } = raw as Record<string, unknown>;
    if (role !== 'user' && role !== 'assistant') {
      return null;
    }
    if (typeof content !== 'string' || content.length === 0 || content.length > MAX_MESSAGE_CHARS) {
      return null;
    }
    out.push({ role, content });
  }
  return out;
}

/** Parse an optional coarse location, or undefined. Returns null when malformed. */
function parseLocation(value: unknown): Location | null | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'object') {
    return null;
  }
  const { lat, lon } = value as Record<string, unknown>;
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }
  return { lat, lon };
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

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const root = body as Record<string, unknown>;

  const messages = parseMessages(root.messages);
  if (!messages) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const intent: OviIntent = OVI_INTENTS.includes(root.intent as OviIntent) ? (root.intent as OviIntent) : 'chat';

  let itemContext: string | null = null;
  if (root.itemContext !== undefined) {
    if (typeof root.itemContext !== 'string' || root.itemContext.length === 0 || root.itemContext.length > MAX_ITEM_CONTEXT_CHARS) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }
    itemContext = root.itemContext;
  }

  const location = parseLocation(root.location);
  if (location === null) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  // Global AI brake (B3): the app-wide kill-switch, or the day's global spend at
  // or over the cap. When engaged Ovi never calls the model — she returns a
  // graceful "resting" turn (200) the client renders as a normal Ovi message
  // (reply present, null outfit, source 'paused'), so a chat never crashes and no
  // live LLM call runs. Layered ABOVE the per-user limit below; the `error` field
  // is an analytics discriminator the render path ignores.
  const globalGate = await checkGlobalAiGate(db);
  if (!globalGate.open) {
    return NextResponse.json(
      { error: 'ai_paused', reply: strings.ovi.resting, outfit: null, source: 'paused', weather: null },
      { status: 200 },
    );
  }

  // Per-user daily rate limit. On the wall we return HTTP 429 whose body is a
  // full OviChatApiResponse — Ovi's limit-reached line as `reply`, a null
  // outfit, `source: 'limit'`, and `weather: null` — so the client renders
  // `reply` through its existing success path (Ovi speaking, not a cold error).
  // The extra `error: 'daily_limit'` is a discriminator for analytics/Sentinel
  // and is ignored by the render path. Contract locked with Nova (web) + Harbor
  // (mobile): status 429, body.reply present, source 'limit'.
  const check = await checkDailyLimit(db, userId, 'ovi-chat');
  if (!check.allowed) {
    return NextResponse.json(
      { error: 'daily_limit', reply: strings.ovi.limitReached, outfit: null, source: 'limit', weather: null },
      { status: 429 },
    );
  }

  const [profile, closet, recentWears] = await Promise.all([
    loadStyleProfile(db, userId),
    loadOviItems(db, userId),
    loadRecentWearLogs(db, userId),
  ]);

  // Coarse, never persisted — used only for this styling turn.
  const weather = location ? await fetchWeather(location.lat, location.lon) : null;

  const { response, source, usage } = await styleWithOvi({
    intent,
    messages,
    profile,
    items: closet,
    wearLogs: recentWears,
    weather,
    itemContext,
  });

  // Log the call for the rate-limit counter and spend rollup. Best-effort: the
  // deterministic/dormant path logs a null-model $0 row (still counts against the
  // daily limit); the LLM path logs its model + tokens so the spend is priced.
  await recordUsage(db, userId, 'ovi-chat', {
    model: usage?.model ?? null,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
  });

  return NextResponse.json({
    reply: response.reply,
    outfit: response.outfit,
    source,
    weather: weather ? { tempC: weather.tempC, condition: weather.condition } : null,
  });
}
