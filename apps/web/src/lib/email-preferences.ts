/**
 * The email-preferences core — the read (is this address subscribed?) and the
 * write (flip subscribe/unsubscribe), both behind the signed-link token.
 *
 * Split from the page + route so the token gate and the DB effects are unit-
 * testable. "Subscribed to The Era Edit" is defined as NOT manually suppressed:
 * a `reason='manual'` row is a user's own unsubscribe, so its presence means
 * unsubscribed and its absence means subscribed. Subscribing removes that row
 * (`removeSuppression`, which only ever deletes manual rows); unsubscribing adds
 * it (`addSuppression(…, 'manual')`). A bounced/complained suppression is NOT
 * user-reversible here — `removeSuppression` won't clear it — which is correct:
 * we never resubscribe an address the mail system told us to stop mailing.
 *
 * Every entry point requires a valid signed token for the address; an invalid one
 * yields `invalid` and never touches the DB.
 */
import { verifyEmailLinkToken, type EmailLinkDeps } from './email-links.ts';

/** Whether the preferences page can be shown, and if so the current state. */
export type PreferencesView =
  | { readonly kind: 'invalid' }
  | { readonly kind: 'ok'; readonly email: string; readonly subscribed: boolean };

/** The outcome of a preferences write. */
export type PreferencesUpdate =
  | { readonly kind: 'invalid' }
  | { readonly kind: 'ok'; readonly subscribed: boolean };

/** The two toggle actions the form can POST. */
export type PreferencesAction = 'subscribe' | 'unsubscribe';

/**
 * Injectable seams: whether an address is currently (manually) suppressed, the
 * subscribe (remove-manual) and unsubscribe (add-manual) writes, the token
 * verifier (defaults to the real HMAC check), and the env it reads.
 */
export interface PreferencesDeps {
  readonly isManuallyUnsubscribed: (email: string) => Promise<boolean>;
  readonly subscribe: (email: string) => Promise<void>;
  readonly unsubscribe: (email: string) => Promise<void>;
  readonly verify?: (email: string, token: string) => boolean;
  readonly env?: EmailLinkDeps['env'];
}

function checkToken(email: string | null, token: string | null, deps: PreferencesDeps): email is string {
  if (!email || !token) {
    return false;
  }
  const verify = deps.verify ?? ((e, t) => verifyEmailLinkToken(e, t, { env: deps.env }));
  return verify(email, token);
}

/**
 * Resolve the preferences view for a signed link. Returns `invalid` (render the
 * calm error) unless the token verifies, in which case it reports whether the
 * address is currently subscribed (= not manually unsubscribed).
 */
export async function loadPreferences(
  email: string | null,
  token: string | null,
  deps: PreferencesDeps,
): Promise<PreferencesView> {
  if (!checkToken(email, token, deps)) {
    return { kind: 'invalid' };
  }
  const unsubscribed = await deps.isManuallyUnsubscribed(email);
  return { kind: 'ok', email, subscribed: !unsubscribed };
}

/**
 * Apply a preferences change for a signed link. `subscribe` removes the manual
 * suppression; `unsubscribe` adds it. Returns `invalid` on a bad token (no DB
 * write), else the resulting subscribed state.
 */
export async function updatePreferences(
  email: string | null,
  token: string | null,
  action: PreferencesAction,
  deps: PreferencesDeps,
): Promise<PreferencesUpdate> {
  if (!checkToken(email, token, deps)) {
    return { kind: 'invalid' };
  }
  if (action === 'subscribe') {
    await deps.subscribe(email);
    return { kind: 'ok', subscribed: true };
  }
  await deps.unsubscribe(email);
  return { kind: 'ok', subscribed: false };
}
