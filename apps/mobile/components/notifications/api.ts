/**
 * Notifications API — the mobile calls into the price-alert endpoints.
 *
 *   GET    /api/notifications/preferences  -> NotificationPreferences
 *   PUT    /api/notifications/preferences  body NotificationPreferences -> NotificationPreferences
 *   GET    /api/notifications              -> { notifications: InAppNotification[] }
 *   POST   /api/notifications/read         body { id }                  -> ok
 *   POST   /api/push/register              body { token, platform }     -> ok
 *   DELETE /api/push/register              body { token, platform }     -> ok
 *
 * Every endpoint is owner-scoped, so each request carries the signed-in session.
 * Better Auth's Expo plugin patches the client's own fetch (`authClient.$fetch`)
 * to inject the persisted session cookie and baseURL — calling through `$fetch`
 * is what attaches credentials. This mirrors `components/shop/api.ts`.
 *
 * Three contracts shape the failure behaviour here:
 *   - `getPreferences` THROWS so the settings screen can fall back to all-off
 *     (the honest opt-out default) rather than showing a wrong state.
 *   - `updatePreferences` THROWS so an optimistic toggle can revert on a failed
 *     write.
 *   - `listNotifications` degrades to `[]` on any error (like `listSaved`) so the
 *     feed's price-drop surface simply stays empty instead of erroring.
 *   - `markRead` is fire-and-forget: the card has already cleared by the time it
 *     runs, so a missed read-mark is invisible and never surfaces.
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
 * The three price-alert channels the preferences screen controls. `priceAlertsEnabled`
 * is the master switch; the two channel flags only matter while it's on. Opt-IN by
 * design — the server seeds every flag false until the user turns one on.
 */
export interface NotificationPreferences {
  readonly priceAlertsEnabled: boolean;
  readonly emailAlerts: boolean;
  readonly pushAlerts: boolean;
}

/**
 * The payload a price-drop notification carries — enough to render an in-app card
 * and click out to the retailer. Prices arrive in minor units (cents); the card
 * formats them (`formatPrice`) at render.
 */
export interface PriceDropPayload {
  readonly productId: string;
  readonly retailer: string;
  readonly title: string;
  readonly oldPriceCents: number;
  readonly newPriceCents: number;
  readonly currency: string;
  readonly imageUrl: string;
  readonly affiliateUrl: string;
}

/**
 * The payload a forwarded-receipt notification carries — the async counterpart to
 * the in-flow import toast. `count` is how many pieces landed as drafts; `message`
 * is the already-composed line to render (built server-side from
 * {@link strings.settings.receiptAddress.newDrafts}), so the client renders it
 * verbatim without re-deriving copy.
 */
export interface ReceiptImportPayload {
  readonly count: number;
  readonly message: string;
}

/** Every payload shape an in-app notification can carry, discriminated by `kind`. */
export type NotificationPayload = PriceDropPayload | ReceiptImportPayload;

/**
 * One in-app notification row. `kind` is `'price_drop'` or `'receipt_import'`
 * today; `readAt` is null until the user views or dismisses the card. `kind`
 * stays a plain string so a future kind doesn't need a client change to fetch —
 * the {@link isPriceDrop} / {@link isReceiptImport} guards narrow the payload.
 */
export interface InAppNotification<P extends NotificationPayload = NotificationPayload> {
  readonly id: string;
  readonly kind: string;
  readonly payload: P;
  readonly createdAt: string;
  readonly readAt: string | null;
}

/** Narrow a notification to the price-drop surface (payload → {@link PriceDropPayload}). */
export function isPriceDrop(n: InAppNotification): n is InAppNotification<PriceDropPayload> {
  return n.kind === 'price_drop';
}

/** Narrow a notification to the receipt-import surface (payload → {@link ReceiptImportPayload}). */
export function isReceiptImport(
  n: InAppNotification,
): n is InAppNotification<ReceiptImportPayload> {
  return n.kind === 'receipt_import';
}

/** The device platforms a push token can register under. */
export type PushPlatform = 'ios' | 'android';

/**
 * The caller's current price-alert preferences. THROWS on any error so the
 * settings screen can fall back to all-off rather than render a wrong state.
 */
export async function getPreferences(): Promise<NotificationPreferences> {
  return apiFetch<NotificationPreferences>('/api/notifications/preferences', { method: 'GET' });
}

/**
 * Persist the price-alert preferences. THROWS on failure so an optimistic toggle
 * can revert; returns the stored row so the UI settles on the server's truth.
 */
export async function updatePreferences(
  prefs: NotificationPreferences,
): Promise<NotificationPreferences> {
  return apiFetch<NotificationPreferences>('/api/notifications/preferences', {
    method: 'PUT',
    body: prefs,
  });
}

/**
 * The caller's in-app notifications. NEVER hard-fails: on any error it degrades
 * to `[]` so the feed's price-drop surface opens empty instead of erroring — a
 * missing list is "nothing new", not a fault to retry.
 */
export async function listNotifications(): Promise<readonly InAppNotification[]> {
  try {
    const { notifications } = await apiFetch<{ notifications: readonly InAppNotification[] }>(
      '/api/notifications',
      { method: 'GET' },
    );
    return notifications;
  } catch {
    return [];
  }
}

/**
 * Mark one notification read — fire-and-forget. The card has already cleared by
 * the time this runs (view or dismiss), so a logging miss must never surface:
 * every error is swallowed. Not awaited by callers.
 */
export function markRead(id: string): void {
  void apiFetch('/api/notifications/read', { method: 'POST', body: { id } }).catch(() => {
    // A missed read-mark is invisible; the card is already gone from the surface.
  });
}

/**
 * Register this device's Expo push token so the server can deliver price-drop
 * pushes. THROWS on failure — the caller ({@link enablePushNotifications}) owns
 * the decision to swallow it and stay dormant.
 */
export async function registerPushToken(token: string, platform: PushPlatform): Promise<void> {
  await apiFetch('/api/push/register', { method: 'POST', body: { token, platform } });
}

/**
 * Unregister this device's push token (the user turned push off). THROWS on
 * failure; the caller ({@link disablePushNotifications}) treats it as best-effort.
 */
export async function unregisterPushToken(token: string, platform: PushPlatform): Promise<void> {
  await apiFetch('/api/push/register', { method: 'DELETE', body: { token, platform } });
}
