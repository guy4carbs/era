/**
 * UI-facing shapes for Ovi's web surfaces (the chat sheet + the Feed "Today"
 * card). These mirror the API contracts of the ovi routes and add the small
 * client-only view state the components carry.
 *
 * The domain types (`OviIntent`, `ProposedOutfit`) come from `@era/core/ovi`,
 * the single source of truth both apps render against.
 */
import type { OviIntent, ProposedOutfit } from '@era/core/ovi';

/** Coarse conditions the ovi routes echo back, used only to lead the copy. */
export interface OviWeather {
  tempC: number;
  condition: string;
}

/**
 * How the reply was produced: `'llm'` (Claude styled it), `'deterministic'` (the
 * closet-only fallback stylist), or `'limit'` (the daily-limit wall — a 429 whose
 * `reply` is Ovi's limit line). `'limit'` lets the client tell a limit turn apart
 * from a normal deterministic styling turn; `'paused'` is the app-wide AI brake
 * (kill-switch / global spend cap) — Ovi's "resting" turn, rendered the same way.
 */
export type OviChatSource = 'llm' | 'deterministic' | 'limit' | 'paused';

/** Response of `POST /api/ovi-chat`. */
export interface OviChatApiResponse {
  reply: string;
  outfit: ProposedOutfit | null;
  source: OviChatSource;
  weather: OviWeather | null;
}

/** Response of `GET /api/ovi/today`. */
export interface OviTodayApiResponse {
  reply: string;
  outfit: ProposedOutfit | null;
  weather: OviWeather | null;
  /**
   * Ovi's one editorial line for the reveal ritual (D9), composed server-side
   * (`composeRevealLine` in `@era/core/ovi`) — e.g. "18° and sunny — the cream
   * knit wants out." Null when there's no look to reveal.
   */
  revealLine: string | null;
}

/** The slice of a closet item the outfit card needs to render a cutout tile. */
export interface CutoutInfo {
  displayUrl: string | null;
  name: string;
  category: string;
}

/** Resolves an outfit's item ids to their cutouts (from `GET /api/items`). */
export type ItemsById = ReadonlyMap<string, CutoutInfo>;

/**
 * One line in the chat transcript. Assistant turns may carry a proposed look
 * and the weather Ovi styled around; a `pending` turn is the "thinking"
 * placeholder shown while the reply is in flight.
 */
export interface ChatEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  outfit?: ProposedOutfit | null;
  weather?: OviWeather | null;
  intent?: OviIntent;
  pending?: boolean;
}
