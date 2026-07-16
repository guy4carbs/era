/**
 * Settings API — the account-level call the settings screen makes.
 *
 * Closet privacy read/write reuse the closet's owner-scoped helpers
 * ({@link getPrivacy} / {@link setPrivacy} in `components/items`), so the only
 * new call here is account deletion. Deletion gets its own helper because the
 * UI must branch on the EXACT server outcome — a typed-confirmation mismatch,
 * a signed-out session, or a genuine failure each drive a different screen
 * state — and the item API's throw-on-any-error helper would flatten those
 * into one. So `deleteAccount` speaks to `/api/delete-account` directly,
 * attaches the session the same way the item API does (Better Auth's Expo
 * plugin — `$fetch` injects the persisted cookie, else the plugin-exposed
 * `getCookie()`), and returns a discriminated result the screen switches on.
 *
 * The response contract is pinned by the route (do not deviate):
 *   200 { deleted: true, storageObjectsDeleted }  -> 'deleted'
 *   400 { error: 'confirmation_mismatch' }         -> 'mismatch'
 *   401 { error: 'unauthenticated' }               -> 'unauthorized'
 *   others (400 'invalid', 403, 500 'deletion_failed', network) -> 'failed'
 */
import { authClient } from '@/lib/auth-client';

/** The outcomes the settings screen renders against. */
export type DeleteAccountResult =
  | { readonly status: 'deleted'; readonly storageObjectsDeleted: number }
  | { readonly status: 'mismatch' }
  | { readonly status: 'unauthorized' }
  | { readonly status: 'failed' };

/** The route's success body. */
interface DeleteSuccess {
  readonly deleted: boolean;
  readonly storageObjectsDeleted: number;
}

/**
 * The error shape Better Auth's `$fetch` surfaces: the parsed JSON body merged
 * with the HTTP `status`. We read `status` to classify and `error` to
 * distinguish a mismatch from any other 400.
 */
interface FetchError {
  readonly status?: number;
  readonly error?: string;
  readonly message?: string;
}

/** The structural slice of the auth client we call, named to stay strict. */
interface AuthFetchClient {
  readonly $fetch?: <T>(
    path: string,
    options: { method: string; body?: unknown },
  ) => Promise<{ data: T | null; error: FetchError | null }>;
  readonly getCookie?: () => string;
}

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/** Map an HTTP status + body error code to a {@link DeleteAccountResult}. */
function classify(status: number | undefined, errorCode: string | undefined): DeleteAccountResult {
  if (status === 401) return { status: 'unauthorized' };
  if (status === 400 && errorCode === 'confirmation_mismatch') return { status: 'mismatch' };
  return { status: 'failed' };
}

/**
 * Request irreversible deletion of the signed-in account. `confirmEmail` is the
 * value the user typed; the server also re-checks it against the session email,
 * and the session (never the body) is the real authorization. Never throws —
 * every path resolves to a {@link DeleteAccountResult}.
 */
export async function deleteAccount(confirmEmail: string): Promise<DeleteAccountResult> {
  const client = authClient as unknown as AuthFetchClient;
  const body = { confirmEmail };

  // Preferred path: the auth client's fetch attaches the persisted session.
  if (typeof client.$fetch === 'function') {
    try {
      const { data, error } = await client.$fetch<DeleteSuccess>(`${baseURL}/api/delete-account`, {
        method: 'POST',
        body,
      });
      if (data?.deleted) {
        return { status: 'deleted', storageObjectsDeleted: data.storageObjectsDeleted ?? 0 };
      }
      return classify(error?.status, error?.error);
    } catch {
      // A thrown request never confirmed deletion — invite a retry, don't sign out.
      return { status: 'failed' };
    }
  }

  // Fallback: plain fetch with the plugin-stored cookie, reading the raw status.
  const cookie = client.getCookie?.() ?? '';
  let response: Response;
  try {
    response = await fetch(`${baseURL}/api/delete-account`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    });
  } catch {
    return { status: 'failed' };
  }

  let parsed: DeleteSuccess & FetchError;
  try {
    parsed = (await response.json()) as DeleteSuccess & FetchError;
  } catch {
    parsed = {} as DeleteSuccess & FetchError;
  }

  if (response.ok && parsed.deleted) {
    return { status: 'deleted', storageObjectsDeleted: parsed.storageObjectsDeleted ?? 0 };
  }
  return classify(response.status, parsed.error);
}
