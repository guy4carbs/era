/**
 * Client helpers for the Ovi outfit-proposal lifecycle: turning a proposed look
 * into a saved outfit (accept) or an append-only reject signal. Both hit the
 * session-gated `/api/ovi/*` routes; the caller owns the toast + view update.
 */
import type { OviIntent, ProposedOutfit } from '@era/core/ovi';

import { localToday } from '../../lib/local-date';
import type { OviChatApiResponse, OviTodayApiResponse } from './types';

/** The outfit row `POST /api/ovi/accept` returns on success (201). */
export interface SavedOutfit {
  id: string;
  name: string;
}

/** Map an intent chip to the `OviIntent` the API understands. */
export type ChipIntent = 'today' | 'style_for' | 'style_item' | 'whats_missing';

/**
 * Save a proposed look. Sends the proposal context so the accept is recorded as
 * a positive signal. Returns the saved outfit (with its new id) or null on
 * failure — the caller decides how loudly to fail.
 */
export async function acceptOutfit(
  outfit: ProposedOutfit,
  intent: OviIntent | undefined,
): Promise<SavedOutfit | null> {
  try {
    const res = await fetch('/api/ovi/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: outfit.name,
        occasion: outfit.occasion,
        itemIds: [...outfit.itemIds],
        intent,
        rationale: outfit.rationale,
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { outfit: SavedOutfit };
    return body.outfit;
  } catch {
    return null;
  }
}

/**
 * Record that a proposed look was passed on. Best-effort — the dismissal always
 * feels instant in the UI, so a failed signal never blocks it.
 */
export async function rejectOutfit(
  outfit: ProposedOutfit,
  intent: OviIntent | undefined,
): Promise<void> {
  try {
    await fetch('/api/ovi/reject', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        itemIds: [...outfit.itemIds],
        intent,
        name: outfit.name,
        occasion: outfit.occasion,
        rationale: outfit.rationale,
      }),
    });
  } catch {
    // Swallow: the reject is a soft training signal, not a user-facing action.
  }
}

/** Inputs to a wear log — a saved outfit id or bare item ids, with optional coords. */
export interface WearLogInput {
  /** A saved outfit's id (the Today card / outfit surfaces). */
  outfitId?: string;
  /** Bare item ids when there's no saved outfit (the item-detail quick log). */
  itemIds?: readonly string[];
  /**
   * Coarse coordinates the surface already holds, forwarded so the server can
   * capture a weather snapshot. NEVER prompt for location just to log a wear —
   * pass these only where the surface already resolved them (e.g. the Today card).
   */
  lat?: number | null;
  lon?: number | null;
  /**
   * The day worn, as `YYYY-MM-DD`. Omit and `logWear` fills in the user's LOCAL
   * calendar date ({@link localToday}); pass it only when back-dating a log. An
   * invalid date is rejected by the server, never silently coerced.
   */
  wornOn?: string;
}

/**
 * Log a look as worn today via the session-gated, same-origin `POST
 * /api/wear-logs` (cookies flow by default). Accepts a saved outfit id or bare
 * item ids; `lat`/`lon` are forwarded only when the surface already has them, so
 * the weather snapshot rides along without a fresh permission prompt. Returns
 * true only on a real 201 so the caller fires `wear_logged` exactly once the wear
 * landed; any failure resolves false and is handled quietly.
 *
 * `wornOn` defaults to the user's LOCAL calendar date, NOT the server's UTC today
 * (Gauge gate, TZ veto): the server would otherwise stamp an evening log west of
 * UTC a day ahead. See {@link localToday}.
 */
export async function logWear(input: WearLogInput): Promise<boolean> {
  const body: Record<string, unknown> = {};
  if (input.outfitId) body.outfitId = input.outfitId;
  if (input.itemIds && input.itemIds.length > 0) body.itemIds = [...input.itemIds];
  if (typeof input.lat === 'number' && typeof input.lon === 'number') {
    body.lat = input.lat;
    body.lon = input.lon;
  }
  body.wornOn = input.wornOn ?? localToday();
  try {
    const res = await fetch('/api/wear-logs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.status === 201;
  } catch {
    return false;
  }
}

/**
 * Ask Ovi to style a turn. Sends the running transcript plus the intent (and an
 * optional focal item / coarse location). Returns null on any transport error so
 * the caller can show a graceful fallback line.
 */
export async function sendOviChat(input: {
  messages: readonly { role: 'user' | 'assistant'; content: string }[];
  intent: OviIntent;
  itemContext?: string | null;
  location?: { lat: number; lon: number } | null;
}): Promise<OviChatApiResponse | null> {
  try {
    const res = await fetch('/api/ovi-chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: input.messages,
        intent: input.intent,
        ...(input.itemContext ? { itemContext: input.itemContext } : {}),
        ...(input.location ? { location: input.location } : {}),
      }),
    });
    // A 429 daily-limit response carries the same `{ reply, outfit, source }`
    // shape with Ovi's limit line as `reply`, so we surface it as a normal turn
    // rather than an error — Ovi speaks the limit, she doesn't error out.
    if (res.status === 429) {
      return (await res.json()) as OviChatApiResponse;
    }
    if (!res.ok) return null;
    return (await res.json()) as OviChatApiResponse;
  } catch {
    return null;
  }
}

/**
 * Fetch today's suggestion. Coordinates are optional and, when present, already
 * rounded by the caller for privacy. Returns null on any transport error.
 */
export async function fetchOviToday(
  location: { lat: number; lon: number } | null,
): Promise<OviTodayApiResponse | null> {
  try {
    const query = location ? `?lat=${location.lat}&lon=${location.lon}` : '';
    const res = await fetch(`/api/ovi/today${query}`);
    if (!res.ok) return null;
    return (await res.json()) as OviTodayApiResponse;
  } catch {
    return null;
  }
}
