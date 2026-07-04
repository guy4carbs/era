/**
 * Ovi's daily suggestion — the Feed "Today" card.
 *
 *   GET /api/ovi/today?lat=<n>&lon=<n>
 *
 * Loads the caller's closet, style profile, and recent wears and returns one
 * suggested look for today. Coordinates are optional; when present they drive a
 * weather-aware suggestion and are used only for the lookup, never stored. Like
 * the chat route, the suggestion is grounded in real closet items and never
 * fails because the model is absent.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 200 { reply, outfit, weather }
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requireUser } from '@era/core';
import { createDbClient } from '@era/db';

import { auth } from '../../../../lib/auth.ts';
import { fetchWeather } from '../../../../lib/weather.ts';
import { loadOviItems, loadRecentWearLogs, loadStyleProfile, styleWithOvi } from '../../../../lib/ovi-server.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** Parse an optional finite coordinate from a query param, within range. */
function coordinate(value: string | null, max: number): number | null {
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < -max || parsed > max) {
    return null;
  }
  return parsed;
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

  const url = new URL(request.url);
  const lat = coordinate(url.searchParams.get('lat'), 90);
  const lon = coordinate(url.searchParams.get('lon'), 180);

  const [profile, closet, recentWears] = await Promise.all([
    loadStyleProfile(db, userId),
    loadOviItems(db, userId),
    loadRecentWearLogs(db, userId),
  ]);

  // Coarse, never persisted — only for today's suggestion.
  const weather = lat !== null && lon !== null ? await fetchWeather(lat, lon) : null;

  const { response } = await styleWithOvi({
    intent: 'today',
    messages: [],
    profile,
    items: closet,
    wearLogs: recentWears,
    weather,
    itemContext: null,
  });

  return NextResponse.json({
    reply: response.reply,
    outfit: response.outfit,
    weather: weather ? { tempC: weather.tempC, condition: weather.condition } : null,
  });
}
