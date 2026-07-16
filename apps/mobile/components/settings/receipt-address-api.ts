/**
 * Receipt-address API — the mobile calls into the personal receipt-forwarding
 * address endpoints.
 *
 *   GET  /api/settings/receipt-address            -> ReceiptAddress
 *   POST /api/settings/receipt-address/regenerate -> ReceiptAddress
 *
 * Both are owner-scoped, so each request carries the signed-in session. Better
 * Auth's Expo plugin patches the client's own fetch (`authClient.$fetch`) to
 * inject the persisted session cookie and baseURL — calling through `$fetch` is
 * what attaches credentials. This mirrors `components/notifications/api.ts`.
 *
 * Both helpers THROW on any non-success:
 *   - `getReceiptAddress` throws so the settings section can offer a quiet retry
 *     rather than render a wrong (e.g. falsely dormant) state.
 *   - `regenerateReceiptAddress` throws so a failed rotation surfaces an honest
 *     toast instead of silently pretending the address changed.
 */
import { authClient } from '@/lib/auth-client';

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
 * The receipt-address state the settings section renders.
 *
 * `dormant` is true when inbound receipts aren't switched on server-side yet (no
 * inbound domain configured); the section shows the "coming soon" line and no
 * address. When `dormant` is false, `address` is the caller's private forwarding
 * address (e.g. `u_k3v9…@in.era.style`).
 */
export interface ReceiptAddress {
  readonly address: string | null;
  readonly dormant: boolean;
}

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
    const { data, error } = await client.$fetch<T>(`${baseURL}${path}`, options);
    if (error) {
      throw new Error(error.message ?? `${path} failed`);
    }
    if (data === null) {
      throw new Error(`${path} failed`);
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

/**
 * The caller's current receipt-forwarding address (and whether the feature is
 * dormant). THROWS on any error so the settings section can offer a retry rather
 * than render a wrong state.
 */
export async function getReceiptAddress(): Promise<ReceiptAddress> {
  return apiFetch<ReceiptAddress>('/api/settings/receipt-address', { method: 'GET' });
}

/**
 * Rotate to a fresh receipt-forwarding address. The old address stops working the
 * instant this returns (a hard kill — see the regenerate-consequence copy). THROWS
 * on failure so the UI can surface an honest toast and leave the old address shown.
 */
export async function regenerateReceiptAddress(): Promise<ReceiptAddress> {
  return apiFetch<ReceiptAddress>('/api/settings/receipt-address/regenerate', { method: 'POST' });
}
