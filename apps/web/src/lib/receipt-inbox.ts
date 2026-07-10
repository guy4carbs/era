/**
 * Server-only token service for the per-user inbound receipt address.
 *
 * A user's private receiving address is `u_<token>@<INBOUND_EMAIL_DOMAIN>`. The
 * `u_` prefix is a routing artifact composed HERE and stripped by the webhook —
 * the `receipt_inbox_tokens` table stores ONLY the bare token. Mail maps to an
 * account by this token, NEVER by matching the sender.
 *
 * Invariants (enforced by the schema, not by a transaction — the Neon HTTP driver
 * has no interactive transactions):
 *   - `token` is globally unique across ALL rows (active and revoked), so a
 *     webhook `WHERE token = ?` resolves to at most one row forever.
 *   - A partial unique index (`receipt_inbox_tokens_active_user_idx`, on user_id
 *     WHERE revoked_at IS NULL) guarantees at most ONE active token per user. That
 *     index — not a transaction — is what makes mint-once and rotate race-safe:
 *     concurrent inserts collide on it, and the loser re-reads the winner's row.
 *
 * Rotation is a HARD kill: {@link regenerateActiveToken} revokes the old row
 * (stamps revoked_at) BEFORE minting the new one, so a leaked address stops
 * resolving immediately.
 */
import { randomBytes } from 'node:crypto';

import { and, eq, isNull } from 'drizzle-orm';

import { type DbClient, receiptInboxTokens } from '@era/db';

/** The address local-part prefix. Composed here; stored bare in the DB. */
export const INBOUND_TOKEN_PREFIX = 'u_';

/**
 * Mint a fresh bare token: 128 bits of crypto-randomness as lowercase hex (32
 * chars). Well within the webhook's `[a-z0-9]{24,}` shape; hex digits are all
 * lowercase, and email local-parts are case-insensitive, so the token is
 * generated, stored, and compared in lowercase.
 */
export function mintTokenValue(): string {
  return randomBytes(16).toString('hex');
}

/** Compose the full receiving address from a bare token + the inbound domain. */
export function composeReceiptAddress(token: string, domain: string): string {
  return `${INBOUND_TOKEN_PREFIX}${token}@${domain}`;
}

/** The active token row for `userId`, or undefined when none is active. */
export async function getActiveToken(
  db: DbClient,
  userId: string,
): Promise<{ token: string } | undefined> {
  const [row] = await db
    .select({ token: receiptInboxTokens.token })
    .from(receiptInboxTokens)
    .where(and(eq(receiptInboxTokens.userId, userId), isNull(receiptInboxTokens.revokedAt)))
    .limit(1);
  return row;
}

/**
 * Return `userId`'s active token, minting the first one on demand. Mint-once even
 * under concurrent first-GETs: if the insert races another and violates the
 * active-user partial unique index, we re-read and return the winner's token
 * rather than surfacing the conflict.
 */
export async function getOrCreateActiveToken(db: DbClient, userId: string): Promise<string> {
  const existing = await getActiveToken(db, userId);
  if (existing) return existing.token;

  try {
    const token = mintTokenValue();
    await db.insert(receiptInboxTokens).values({ userId, token });
    return token;
  } catch (error) {
    // A concurrent mint won the active-user index — return its token.
    const raced = await getActiveToken(db, userId);
    if (raced) return raced.token;
    throw error;
  }
}

/**
 * Rotate `userId`'s address: revoke every active token, then mint a fresh one.
 * Revoke-before-mint keeps the active-user partial unique index satisfied (the
 * index — not a transaction — is the exactly-one-active guarantee). On a race
 * where a concurrent rotate already minted the replacement, re-read and return it.
 */
export async function regenerateActiveToken(db: DbClient, userId: string): Promise<string> {
  await db
    .update(receiptInboxTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(receiptInboxTokens.userId, userId), isNull(receiptInboxTokens.revokedAt)));

  try {
    const token = mintTokenValue();
    await db.insert(receiptInboxTokens).values({ userId, token });
    return token;
  } catch (error) {
    const raced = await getActiveToken(db, userId);
    if (raced) return raced.token;
    throw error;
  }
}

/** How a bare token resolved: to an account (active or revoked), or not at all. */
export type TokenResolution =
  | { readonly status: 'active'; readonly userId: string }
  | { readonly status: 'revoked' }
  | { readonly status: 'unknown' };

/**
 * Resolve a bare token for the inbound webhook. Because `token` is globally unique
 * this touches at most one row. A revoked token resolves to `revoked` (a hard
 * drop) rather than `unknown`, so mail to a just-rotated address is dropped
 * deliberately, not treated as unroutable. NO user context is trusted — the token
 * is the only key.
 */
export async function resolveToken(db: DbClient, token: string): Promise<TokenResolution> {
  const [row] = await db
    .select({ userId: receiptInboxTokens.userId, revokedAt: receiptInboxTokens.revokedAt })
    .from(receiptInboxTokens)
    .where(eq(receiptInboxTokens.token, token))
    .limit(1);
  if (!row) return { status: 'unknown' };
  if (row.revokedAt !== null) return { status: 'revoked' };
  return { status: 'active', userId: row.userId };
}
