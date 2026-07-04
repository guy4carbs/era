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

/** Response of `POST /api/ovi-chat`. */
export interface OviChatApiResponse {
  reply: string;
  outfit: ProposedOutfit | null;
  source: string;
  weather: OviWeather | null;
}

/** Response of `GET /api/ovi/today`. */
export interface OviTodayApiResponse {
  reply: string;
  outfit: ProposedOutfit | null;
  weather: OviWeather | null;
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
