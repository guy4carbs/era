/**
 * @era/core — authorization module.
 *
 * ============================================================================
 * EVERY API ROUTE HANDLER MUST USE THESE GUARDS. NO EXCEPTIONS.
 * ============================================================================
 *
 * This is the single, framework-agnostic authorization surface for Era. It is
 * deliberately decoupled from any web framework, session library, or database
 * client: a handler resolves the caller into an {@link AuthContext} (extract
 * the authenticated user id, or `null` for anonymous) and then calls the
 * appropriate guard BEFORE touching data.
 *
 * Rules of the road:
 *   - ALL writes (insert/update/delete) go through {@link ownerOnly} or a
 *     domain policy below.
 *   - Reads of a PRIVATE resource go through {@link ownerOnly}.
 *   - Reads that may be public go through {@link publicReadable}.
 *   - User-scoped list queries still filter in SQL by `requireUser(ctx)` — the
 *     guard authenticates, the WHERE clause scopes. Never rely on one alone.
 *
 * Errors never embed resource data (ids, emails, contents). An {@link AuthzError}
 * carries only a machine-readable {@link AuthzError.code}; map it to an HTTP
 * status at the framework boundary (UNAUTHENTICATED -> 401, FORBIDDEN -> 403).
 */

/**
 * The authenticated caller, reduced to the one fact authorization needs.
 * `userId === null` means anonymous / unauthenticated.
 */
export interface AuthContext {
  readonly userId: string | null;
}

/** Machine-readable authorization failure codes. */
export type AuthzErrorCode = 'UNAUTHENTICATED' | 'FORBIDDEN';

/**
 * The only error these guards throw. The message is a fixed, generic string
 * per code — it MUST NOT embed resource identifiers, owner ids, emails, or any
 * caller-supplied data, so it is always safe to surface or log.
 */
export class AuthzError extends Error {
  readonly code: AuthzErrorCode;

  constructor(code: AuthzErrorCode) {
    super(
      code === 'UNAUTHENTICATED'
        ? 'Authentication is required for this action.'
        : 'You do not have permission to perform this action.',
    );
    this.name = 'AuthzError';
    this.code = code;
    // Preserve prototype chain across the ES target down-level transform.
    Object.setPrototypeOf(this, AuthzError.prototype);
  }
}

/**
 * Assert the caller is authenticated and return their user id.
 * @throws {AuthzError} code `UNAUTHENTICATED` when anonymous.
 */
export function requireUser(ctx: AuthContext): string {
  if (ctx.userId === null) {
    throw new AuthzError('UNAUTHENTICATED');
  }
  return ctx.userId;
}

/**
 * Assert the authenticated caller owns the resource. Use for ALL writes and for
 * reads of resources that are private by definition (there is no public path).
 * @throws {AuthzError} `UNAUTHENTICATED` when anonymous, `FORBIDDEN` when the
 *   caller is authenticated but is not the owner.
 */
export function ownerOnly(ctx: AuthContext, resourceOwnerId: string): void {
  const userId = requireUser(ctx);
  if (userId !== resourceOwnerId) {
    throw new AuthzError('FORBIDDEN');
  }
}

/**
 * A resource whose visibility is governed by a privacy flag. `userId` is the
 * OWNER of the resource.
 *
 * SINGLE MECHANISM for visibility: the caller always presents `isPrivate`.
 *   - For a profile row, `isPrivate` is the profile's own column
 *     (map `user_id` -> `userId`).
 *   - For an outfit or an era, visibility derives from the OWNER'S profile, not
 *     from the row itself. The caller passes
 *     `{ userId: ownerId, isPrivate: ownerProfile.isPrivate }`.
 * There is intentionally no second `publicReadableVia` helper — one mechanism,
 * one thing to reason about.
 */
export interface VisibilityResource {
  readonly userId: string;
  readonly isPrivate: boolean;
}

/**
 * Allow a read when the caller is the owner, or when the resource is public
 * (`isPrivate === false`). Anonymous callers may read public resources; a
 * private resource is readable only by its owner.
 * @throws {AuthzError} `FORBIDDEN` when a non-owner (including anonymous) tries
 *   to read a private resource.
 */
export function publicReadable(ctx: AuthContext, resource: VisibilityResource): void {
  if (ctx.userId !== null && ctx.userId === resource.userId) {
    return; // Owner always reads their own.
  }
  if (resource.isPrivate) {
    throw new AuthzError('FORBIDDEN');
  }
  // Public resource: anonymous and any authenticated non-owner may read.
}

// ---------------------------------------------------------------------------
// Domain policies — thin, explicit, unit-testable. Each mirrors a specific
// write path so handlers read declaratively instead of re-deriving ownership.
// ---------------------------------------------------------------------------

/**
 * Follow edges: only the authenticated follower may create or delete their own
 * edge. `followerId` is the id that will be written as the edge's follower.
 * @throws {AuthzError} `UNAUTHENTICATED` when anonymous, `FORBIDDEN` when the
 *   caller is not the follower.
 */
export function canInsertFollow(ctx: AuthContext, follow: { readonly followerId: string }): void {
  ownerOnly(ctx, follow.followerId);
}

/**
 * ai_events: append-only, inserted only by the owning user. There are
 * deliberately NO update/delete helpers — the ai_events table is append-only by
 * design; audit rows are never mutated once written.
 * @throws {AuthzError} `UNAUTHENTICATED` when anonymous, `FORBIDDEN` when the
 *   caller is not the owner of the event.
 */
export function canInsertAiEvent(ctx: AuthContext, event: { readonly userId: string }): void {
  ownerOnly(ctx, event.userId);
}

/**
 * saved_products (wishlist / save-for-later): a user's saved shop products are
 * private and owner-scoped. Insert, delete, and read all go through the owner —
 * only the authenticated user may add to, remove from, or read their own saves.
 * `saved.userId` is the id that will be written as (or is stored on) the row.
 * @throws {AuthzError} `UNAUTHENTICATED` when anonymous, `FORBIDDEN` when the
 *   caller is not the owner.
 */
export function canInsertSavedProduct(
  ctx: AuthContext,
  saved: { readonly userId: string },
): void {
  ownerOnly(ctx, saved.userId);
}

export function canDeleteSavedProduct(
  ctx: AuthContext,
  saved: { readonly userId: string },
): void {
  ownerOnly(ctx, saved.userId);
}

export function canReadSavedProduct(
  ctx: AuthContext,
  saved: { readonly userId: string },
): void {
  ownerOnly(ctx, saved.userId);
}

/**
 * notification_preferences (price-alert opt-ins): a user's alert settings are
 * private and owner-scoped. A user reads and upserts only their own row — every
 * alert channel is opt-in, so no other user may read or flip these flags.
 * `prefs.userId` is the id stored on (or written as) the row.
 * @throws {AuthzError} `UNAUTHENTICATED` when anonymous, `FORBIDDEN` when the
 *   caller is not the owner.
 */
export function canReadNotificationPreferences(
  ctx: AuthContext,
  prefs: { readonly userId: string },
): void {
  ownerOnly(ctx, prefs.userId);
}

export function canUpsertNotificationPreferences(
  ctx: AuthContext,
  prefs: { readonly userId: string },
): void {
  ownerOnly(ctx, prefs.userId);
}

/**
 * push_tokens (device registrations for push alerts): a user registers and
 * removes only their own device tokens. `token.userId` is the id stored on (or
 * written as) the row.
 * @throws {AuthzError} `UNAUTHENTICATED` when anonymous, `FORBIDDEN` when the
 *   caller is not the owner.
 */
export function canInsertPushToken(
  ctx: AuthContext,
  token: { readonly userId: string },
): void {
  ownerOnly(ctx, token.userId);
}

export function canDeletePushToken(
  ctx: AuthContext,
  token: { readonly userId: string },
): void {
  ownerOnly(ctx, token.userId);
}

/**
 * in_app_notifications (the "price dropped" card store): a user reads and marks
 * read only their own notifications. `notification.userId` is the id stored on
 * the row. There is no owner-facing insert guard — notifications are written by
 * the server-side price-check job, not by the user.
 * @throws {AuthzError} `UNAUTHENTICATED` when anonymous, `FORBIDDEN` when the
 *   caller is not the owner.
 */
export function canReadInAppNotification(
  ctx: AuthContext,
  notification: { readonly userId: string },
): void {
  ownerOnly(ctx, notification.userId);
}

export function canUpdateInAppNotification(
  ctx: AuthContext,
  notification: { readonly userId: string },
): void {
  ownerOnly(ctx, notification.userId);
}

/**
 * Waitlist: a public, insert-only signup. Always allowed — no authentication
 * required. This guard exists so that every write handler calls an authz check,
 * keeping the "no route without a guard" invariant uniform and greppable.
 */
export function canInsertWaitlist(): void {
  // Intentionally always permitted.
}
