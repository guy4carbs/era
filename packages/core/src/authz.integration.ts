/**
 * @era/core — authorization INTEGRATION test (live Neon dev branch).
 *
 * This file is intentionally NOT matched by the unit test glob
 * (`src/*.test.ts`). Run it explicitly:  `pnpm --filter @era/core test:integration`.
 * Gauge runs it against the Neon dev branch; it must FAIL LOUDLY with a clear
 * instruction when the connection string is absent (see requireDbUrl()).
 *
 * It proves the authz guards compose correctly with real, user-scoped queries:
 *   - a user's list query returns ONLY their own rows,
 *   - reading another user's private resource is FORBIDDEN,
 *   - reading a public profile succeeds for the owner AND for anonymous,
 *   - reading a private profile is FORBIDDEN for anonymous.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { createDbClient, user, profiles, items } from '@era/db';

import {
  AuthzError,
  requireUser,
  ownerOnly,
  publicReadable,
  type AuthContext,
} from './authz.ts';

/**
 * Resolve the dev-branch connection string or abort with an actionable message.
 * NEON_DATABASE_URL_DEV is preferred; DATABASE_URL is accepted as a fallback.
 */
function requireDbUrl(): string {
  const url = process.env.NEON_DATABASE_URL_DEV ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'authz.integration: no database URL. Set NEON_DATABASE_URL_DEV (or ' +
        'DATABASE_URL). Source the repo-root .env first, e.g. ' +
        '`set -a; source ../../.env; set +a` from packages/core, then re-run ' +
        '`pnpm --filter @era/core test:integration`.',
    );
  }
  return url;
}

test('authz guards enforce ownership and visibility against the live database', async () => {
  const db = createDbClient(requireDbUrl());

  // Unique per run so concurrent/repeated runs never collide.
  const run = randomUUID().slice(0, 8);
  const idA = `itest_A_${run}`;
  const idB = `itest_B_${run}`;
  const now = new Date();

  // NOTE (assumptions about @era/db, flagged for Vector):
  //  - `user` is the Better Auth users table with notNull id/name/email/
  //    emailVerified/createdAt/updatedAt. If Vector's columns differ, adjust
  //    these literals; the inferred insert types will flag it at typecheck.
  //  - `profiles.userId` is the PK/FK to user.id, `profiles.isPrivate` boolean.
  //  - `items` requires userId plus category/source (unions) and a name.
  try {
    await db.insert(user).values([
      {
        id: idA,
        name: `itest A ${run}`,
        email: `itest_a_${run}@era.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: idB,
        name: `itest B ${run}`,
        email: `itest_b_${run}@era.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // A: public profile. B: private profile. `username` is notNull/unique with
    // no default, so each fixture supplies a run-scoped handle.
    await db.insert(profiles).values([
      { userId: idA, username: `itest_a_${run}`, isPrivate: false },
      { userId: idB, username: `itest_b_${run}`, isPrivate: true },
    ]);

    // One item each, so a scoped list query has something to (not) leak.
    // `source` is the item_source enum: photo | link | email_import.
    await db.insert(items).values([
      { userId: idA, name: `A tee ${run}`, category: 'top', source: 'photo' },
      { userId: idB, name: `B tee ${run}`, category: 'top', source: 'photo' },
    ]);

    const ctxA: AuthContext = { userId: idA };
    const anon: AuthContext = { userId: null };

    // (1) Handler: "list my items" — authenticate, then scope in SQL.
    const aItems = await db.select().from(items).where(eq(items.userId, requireUser(ctxA)));
    assert.equal(aItems.length, 1, 'A must see exactly one item');
    assert.equal(aItems[0]?.userId, idA, "A's list must contain only A's item");

    // (2) Handler: "A reads B's item" — an item is private to its owner.
    // Fetch the row the way a handler would, then guard on it.
    const [bItem] = await db.select().from(items).where(eq(items.userId, idB));
    assert.ok(bItem, 'B item fixture must exist');
    assertForbidden(() => ownerOnly(ctxA, bItem.userId), [idA, idB]);

    // (3) Handler: read A's PUBLIC profile — owner and anonymous both allowed.
    const [aProfile] = await db.select().from(profiles).where(eq(profiles.userId, idA));
    assert.ok(aProfile, 'A profile fixture must exist');
    assert.equal(aProfile.isPrivate, false);
    assert.doesNotThrow(() => publicReadable(ctxA, aProfile));
    assert.doesNotThrow(() => publicReadable(anon, aProfile));

    // (4) Handler: anonymous reads B's PRIVATE profile — FORBIDDEN.
    const [bProfile] = await db.select().from(profiles).where(eq(profiles.userId, idB));
    assert.ok(bProfile, 'B profile fixture must exist');
    assert.equal(bProfile.isPrivate, true);
    assertForbidden(() => publicReadable(anon, bProfile), [idA, idB]);
  } finally {
    // Cleanup: deleting the users cascades to profiles/items/etc.
    await db.delete(user).where(eq(user.id, idA));
    await db.delete(user).where(eq(user.id, idB));
  }
});

/** Assert a thunk throws AuthzError('FORBIDDEN') and leaks no id into the message. */
function assertForbidden(fn: () => void, leaked: readonly string[]): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof AuthzError);
    assert.equal(error.code, 'FORBIDDEN');
    for (const secret of leaked) {
      assert.ok(!error.message.includes(secret), `error message leaked "${secret}"`);
    }
    return true;
  });
}
