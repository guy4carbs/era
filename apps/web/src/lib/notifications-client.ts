/**
 * Browser-side Notifications transport. Thin, typed wrappers over Forge's three
 * same-origin routes so the price-alert surfaces never hand-roll a fetch. Every
 * call is credentialed same-origin (the routes read/write the signed-in user's
 * own preferences and notifications); nothing here holds a secret. Mirrors the
 * shape and conventions of {@link file://./shop-client.ts}.
 *
 * Two lanes:
 *  - Preferences: `GET`/`PUT /api/notifications/preferences` — the settings
 *    toggles. The PUT takes any subset, so {@link updatePreferences} accepts a
 *    Partial and lets the caller send just the field that changed.
 *  - Feed: `GET /api/notifications` → the in-app rows; `POST /api/notifications/read`
 *    marks one read. Every read is awaited (the caller reflects it in the UI) but
 *    a click-out must never wait on it — see {@link PriceDropCard}.
 */

/** The three notification-preference switches, as returned by GET/accepted by PUT. */
export interface NotificationPreferences {
  readonly priceAlertsEnabled: boolean;
  readonly emailAlerts: boolean;
  readonly pushAlerts: boolean;
}

/**
 * The payload carried by a `price_drop` notification row. Prices are in integer
 * cents (`oldPriceCents`/`newPriceCents`) and formatted client-side against
 * `currency`; `affiliateUrl` is the monetised click-out, https-guarded at render.
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
 * One in-app notification row. `kind` discriminates the payload; today the only
 * rendered kind is `'price_drop'`. `readAt` is null until the user clicks out or
 * dismisses. Unknown future kinds carry an opaque payload and are simply skipped
 * by the price-drop surface.
 */
export interface AppNotification {
  readonly id: string;
  readonly kind: string;
  readonly payload: PriceDropPayload | Record<string, unknown>;
  readonly createdAt: string;
  readonly readAt: string | null;
}

/** Narrow a row to a rendered price-drop card. */
export function isPriceDrop(
  notification: AppNotification,
): notification is AppNotification & { payload: PriceDropPayload } {
  return notification.kind === 'price_drop';
}

/** GET the user's notification preferences. Throws on non-200. */
export async function getPreferences(): Promise<NotificationPreferences> {
  const res = await fetch('/api/notifications/preferences', {
    method: 'GET',
    credentials: 'same-origin',
  });
  if (!res.ok) {
    throw new Error(`notifications-preferences failed: ${res.status}`);
  }
  return (await res.json()) as NotificationPreferences;
}

/**
 * PUT a subset of the preferences → the full updated set. The route accepts any
 * subset, so the settings UI sends only the toggle that changed and applies the
 * echoed result. Throws on non-200 so the caller can revert an optimistic flip.
 */
export async function updatePreferences(
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const res = await fetch('/api/notifications/preferences', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(`notifications-preferences update failed: ${res.status}`);
  }
  return (await res.json()) as NotificationPreferences;
}

/** GET the user's in-app notifications, newest first. Throws on non-200. */
export async function listNotifications(): Promise<AppNotification[]> {
  const res = await fetch('/api/notifications', {
    method: 'GET',
    credentials: 'same-origin',
  });
  if (!res.ok) {
    throw new Error(`notifications-list failed: ${res.status}`);
  }
  const body = (await res.json()) as { notifications: AppNotification[] };
  return body.notifications;
}

/**
 * Mark one notification read: `POST /api/notifications/read { id }`. Awaited so
 * the caller can drop the row optimistically, but a click-out fires this without
 * blocking the navigation — the anchor opens first, the read lands after.
 */
export async function markRead(id: string): Promise<void> {
  const res = await fetch('/api/notifications/read', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    throw new Error(`notifications-read failed: ${res.status}`);
  }
}
