/**
 * @era/core — platform-free auth API contract.
 *
 * Both the Next.js web app and the Expo mobile app talk to Better Auth through
 * a client object, but they must NOT each re-derive the calling convention. This
 * module defines the single shared surface: an {@link EraAuthApi} the UI calls,
 * and a structural {@link AuthClientLike} it adapts.
 *
 * Deliberately dependency-free — no `react`, no `better-auth` imports. It only
 * knows the SHAPE of a Better Auth client via structural typing, so it compiles
 * on every platform and is trivially unit-testable with a fake client. The real
 * `authClient` from each platform's `auth-client.ts` is passed in at the edge.
 *
 * Better Auth client methods resolve to `{ data, error }` rather than rejecting;
 * {@link createEraAuthApi} inspects that envelope and throws a readable Error so
 * callers can use ordinary try/catch instead of checking a result field.
 */

/**
 * The authenticated caller as the UI needs it. Mirrors the fields Better Auth's
 * session user always carries; `name` is nullable because a magic-link sign-up
 * has no name until the user sets one.
 */
export interface AuthSession {
  readonly userId: string;
  readonly email: string;
  readonly name: string | null;
}

/**
 * The auth actions the Era UI invokes. Both platforms consume this identical
 * surface, so a screen written against it is portable between web and mobile.
 */
export interface EraAuthApi {
  /** Send a passwordless magic link to `email`. Resolves once the request is accepted. */
  signInMagicLink(email: string, callbackURL?: string): Promise<void>;
  /** Begin an OAuth flow with the given social provider. */
  signInSocial(provider: 'apple' | 'google', callbackURL?: string): Promise<void>;
  /** End the current session. */
  signOut(): Promise<void>;
}

/**
 * The structural subset of a Better Auth client this adapter depends on. The
 * real client has far more; we name only what we call so the contract stays
 * minimal and a test fake is a few lines.
 */
export interface AuthClientLike {
  readonly signIn: {
    magicLink(options: { email: string; callbackURL?: string }): Promise<unknown>;
    social(options: { provider: string; callbackURL?: string }): Promise<unknown>;
  };
  signOut(): Promise<unknown>;
}

/**
 * The session snapshot shape shared by both platforms' `useSession` hooks.
 * `data` is `null` while signed out; `isPending` is true during the initial
 * load or a refetch. Kept here so web and mobile agree on one shape.
 */
export interface SessionState {
  readonly data: { readonly user: AuthSession } | null;
  readonly isPending: boolean;
}

/** The reactive session hook each platform implements over its own client. */
export type UseSession = () => SessionState;

/**
 * A Better Auth error envelope. The client resolves (not rejects) with this
 * `error` field populated when a request fails; `message`/`statusText` carry a
 * human-readable reason, `status` the HTTP code.
 */
interface AuthErrorEnvelope {
  readonly error: {
    readonly message?: string;
    readonly statusText?: string;
    readonly status?: number;
  } | null;
}

/**
 * Detect and surface a Better Auth `{ error }` envelope. Better Auth resolves
 * rather than rejects on failure, so we inspect the result and throw a readable
 * Error — never embedding anything beyond the provider's own message/status.
 */
function throwOnError(result: unknown, action: string): void {
  if (typeof result !== 'object' || result === null) {
    return;
  }
  const { error } = result as AuthErrorEnvelope;
  if (!error) {
    return;
  }
  const reason = error.message ?? error.statusText ?? (error.status ? `HTTP ${error.status}` : 'unknown error');
  throw new Error(`${action} failed: ${reason}`);
}

/**
 * Wrap a raw Better Auth client in the Era auth API. Thin by design: each method
 * forwards to the client and converts a returned error envelope into a thrown
 * Error, so every consumer gets uniform try/catch semantics.
 */
export function createEraAuthApi(client: AuthClientLike): EraAuthApi {
  return {
    async signInMagicLink(email: string, callbackURL?: string): Promise<void> {
      const result = await client.signIn.magicLink({ email, callbackURL });
      throwOnError(result, 'Magic link sign-in');
    },
    async signInSocial(provider: 'apple' | 'google', callbackURL?: string): Promise<void> {
      const result = await client.signIn.social({ provider, callbackURL });
      throwOnError(result, 'Social sign-in');
    },
    async signOut(): Promise<void> {
      const result = await client.signOut();
      throwOnError(result, 'Sign-out');
    },
  };
}
