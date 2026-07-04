/**
 * Ovi API — the mobile calls into Ovi's chat + styling endpoints.
 *
 *   POST /api/ovi-chat      { messages, intent?, itemContext?, location? }
 *                             -> { reply, outfit, source, weather }
 *   GET  /api/ovi/today?lat&lon
 *                             -> { reply, outfit, weather }
 *   POST /api/ovi/accept     { name?, occasion?, itemIds, intent?, rationale? }
 *                             -> 201 { outfit }
 *   POST /api/ovi/reject     { name?, occasion?, itemIds, intent?, rationale? }
 *                             -> { success }
 *
 * Every endpoint is owner-scoped, so each request carries the signed-in session.
 * Better Auth's Expo plugin patches the client's own fetch (`authClient.$fetch`)
 * to inject the persisted session cookie and baseURL — calling through `$fetch`
 * is what attaches credentials. This mirrors `components/items/api.ts`.
 *
 * The outfit a turn proposes references bare closet item ids; the UI resolves each
 * id to its cutout via the closet's `fetchItems` (displayUrls). Ovi never invents
 * an item, so an id that no longer resolves is simply dropped from the collage.
 */
import { authClient } from '@/lib/auth-client';

import type { OviIntent, ProposedOutfit } from '@era/core/ovi';

/** One turn of the conversation as the chat endpoint bounds it. */
export interface OviChatMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

/** The coarse conditions a styling turn was built around (never stored). */
export interface OviWeather {
  readonly tempC: number;
  readonly condition: string;
}

/** A coarse coordinate for the weather lookup — rounded before it leaves the device. */
export interface OviLocation {
  readonly lat: number;
  readonly lon: number;
}

/** The chat endpoint's reply: a spoken line, an optional look, and its provenance. */
export interface OviChatResult {
  readonly reply: string;
  readonly outfit: ProposedOutfit | null;
  readonly source: string;
  readonly weather: OviWeather | null;
}

/** The daily-suggestion endpoint's reply for the Feed "Today" card. */
export interface OviTodayResult {
  readonly reply: string;
  readonly outfit: ProposedOutfit | null;
  readonly weather: OviWeather | null;
}

/** The proposal context echoed back to the accept/reject events. */
export interface OviProposalContext {
  readonly name?: string;
  readonly occasion?: string;
  readonly itemIds: readonly string[];
  readonly intent?: OviIntent;
  readonly rationale?: string;
}

/** The structural slice of the auth client we call, named to stay strict. */
interface AuthFetchClient {
  readonly $fetch?: <T>(
    path: string,
    options: { method: string; body?: unknown },
  ) => Promise<{ data: T | null; error: { message?: string } | null }>;
  readonly getCookie?: () => string;
}

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * Authenticated JSON call into an Era API route. Prefers the auth client's
 * `$fetch` (which attaches the session), falling back to a bare fetch with the
 * plugin-stored cookie. Throws on any non-success so callers surface a retry.
 */
async function apiFetch<T>(
  path: string,
  options: { method: string; body?: unknown },
): Promise<T> {
  const client = authClient as unknown as AuthFetchClient;

  if (typeof client.$fetch === 'function') {
    const { data, error } = await client.$fetch<T>(path, options);
    if (error || data === null) {
      throw new Error(error?.message ?? `${path} failed`);
    }
    return data;
  }

  const cookie = client.getCookie?.() ?? '';
  const headers: Record<string, string> = { cookie };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  const response = await fetch(`${baseURL}${path}`, {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

/** Inputs to a chat turn: the conversation so far plus optional styling context. */
export interface OviChatInput {
  readonly messages: readonly OviChatMessage[];
  readonly intent?: OviIntent;
  readonly itemContext?: string;
  readonly location?: OviLocation;
}

/** Send a chat turn to Ovi and get her reply (and a look when the ask was styling). */
export async function chatWithOvi(input: OviChatInput): Promise<OviChatResult> {
  const body: Record<string, unknown> = { messages: input.messages };
  if (input.intent) body.intent = input.intent;
  if (input.itemContext) body.itemContext = input.itemContext;
  if (input.location) body.location = input.location;
  return apiFetch<OviChatResult>('/api/ovi-chat', { method: 'POST', body });
}

/**
 * Ovi's daily suggestion for the Feed "Today" card. `location` is optional; when
 * absent the suggestion is weatherless (still grounded in the real closet).
 */
export async function fetchToday(location?: OviLocation): Promise<OviTodayResult> {
  const query = location ? `?lat=${location.lat}&lon=${location.lon}` : '';
  return apiFetch<OviTodayResult>(`/api/ovi/today${query}`, { method: 'GET' });
}

/** The inserted outfits row returned when a proposed look is saved. */
export interface SavedOutfit {
  readonly id: string;
  readonly name: string | null;
  readonly occasion: string | null;
}

/** Save a look Ovi proposed. Records an accept event and persists the outfit. */
export async function acceptOutfit(context: OviProposalContext): Promise<SavedOutfit> {
  const { outfit } = await apiFetch<{ outfit: SavedOutfit }>('/api/ovi/accept', {
    method: 'POST',
    body: proposalBody(context),
  });
  return outfit;
}

/** Pass on a look Ovi proposed. Records a reject event; nothing is saved. */
export async function rejectOutfit(context: OviProposalContext): Promise<boolean> {
  const { success } = await apiFetch<{ success: boolean }>('/api/ovi/reject', {
    method: 'POST',
    body: proposalBody(context),
  });
  return success;
}

/** Shape a proposal into the accept/reject request body, dropping absent fields. */
function proposalBody(context: OviProposalContext): Record<string, unknown> {
  const body: Record<string, unknown> = { itemIds: context.itemIds };
  if (context.name) body.name = context.name;
  if (context.occasion) body.occasion = context.occasion;
  if (context.intent) body.intent = context.intent;
  if (context.rationale) body.rationale = context.rationale;
  return body;
}
