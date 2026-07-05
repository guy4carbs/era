/**
 * Daily-limit detection for the three metered AI routes.
 *
 * Forge's routes answer a per-user daily cap with HTTP 429 and a warm, Ovi-voice
 * body — NOT a cold error the UI should treat as a failure:
 *   - ovi-chat            → { error: 'daily_limit', reply, outfit: null, source }
 *   - process-item        → { error: 'daily_limit', message }
 *   - derive-style-profile→ { error: 'daily_limit', message }
 *
 * The mobile API helpers throw {@link LimitReachedError} on a 429 so callers can
 * tell "you've done a lot today" apart from a genuine error and render Ovi's line
 * instead of a retry. Every non-429 path is untouched.
 */

/** A metered route said the user hit their daily cap. Carries the server's line. */
export class LimitReachedError extends Error {
  readonly status = 429;
  /** The warm line the route returned (`reply` or `message`), or null if absent. */
  readonly serverMessage: string | null;

  constructor(serverMessage: string | null) {
    super(serverMessage ?? 'daily limit reached');
    this.name = 'LimitReachedError';
    this.serverMessage = serverMessage;
  }
}

/** Pull the warm line out of a 429 body — `reply` (ovi-chat) or `message` (others). */
function limitLineFromBody(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.reply === 'string') return record.reply;
  if (typeof record.message === 'string') return record.message;
  return null;
}

/**
 * Detect a daily-limit from a Better Auth `$fetch` error object. Non-2xx errors
 * spread the parsed body alongside `status`/`statusText`, so a 429's `reply` or
 * `message` is readable straight off the error. Returns null for anything else.
 */
export function limitFromFetchError(error: unknown): LimitReachedError | null {
  if (typeof error !== 'object' || error === null) return null;
  const record = error as Record<string, unknown>;
  if (record.status !== 429) return null;
  return new LimitReachedError(limitLineFromBody(error));
}

/**
 * Build a {@link LimitReachedError} from a bare-fetch `Response` known to be 429.
 * Reads the JSON body best-effort so a warm line is preserved even when parsing
 * would otherwise fail.
 */
export async function limitFromResponse(response: Response): Promise<LimitReachedError> {
  const body = await response.json().catch(() => null);
  return new LimitReachedError(limitLineFromBody(body));
}
