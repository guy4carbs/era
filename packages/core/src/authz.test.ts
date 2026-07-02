import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AuthzError,
  requireUser,
  ownerOnly,
  publicReadable,
  canInsertFollow,
  canInsertAiEvent,
  canInsertWaitlist,
  type AuthContext,
} from './authz.ts';

// Two distinct users, A !== B, plus the anonymous context.
const A = 'user_A';
const B = 'user_B';
const ctxA: AuthContext = { userId: A };
const ctxB: AuthContext = { userId: B };
const anon: AuthContext = { userId: null };

/** Assert a thunk throws an AuthzError with a specific code and no leaked data. */
function assertAuthz(fn: () => void, code: AuthzError['code'], leaked: readonly string[] = []): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof AuthzError, 'expected an AuthzError');
    assert.equal(error.code, code);
    for (const secret of leaked) {
      assert.ok(!error.message.includes(secret), `error message leaked "${secret}"`);
    }
    return true;
  });
}

// --- requireUser ------------------------------------------------------------

test('requireUser returns the id for an authenticated caller', () => {
  assert.equal(requireUser(ctxA), A);
});

test('requireUser throws UNAUTHENTICATED for an anonymous caller', () => {
  assertAuthz(() => requireUser(anon), 'UNAUTHENTICATED');
});

// --- ownerOnly --------------------------------------------------------------

test('ownerOnly allows the owner', () => {
  assert.doesNotThrow(() => ownerOnly(ctxA, A));
});

test('ownerOnly throws FORBIDDEN for a different authenticated user', () => {
  assertAuthz(() => ownerOnly(ctxA, B), 'FORBIDDEN', [A, B]);
});

test('ownerOnly throws UNAUTHENTICATED for anonymous before checking ownership', () => {
  assertAuthz(() => ownerOnly(anon, A), 'UNAUTHENTICATED', [A]);
});

// --- publicReadable ---------------------------------------------------------

test('publicReadable allows the owner to read their own private resource', () => {
  assert.doesNotThrow(() => publicReadable(ctxA, { userId: A, isPrivate: true }));
});

test('publicReadable allows the owner to read their own public resource', () => {
  assert.doesNotThrow(() => publicReadable(ctxA, { userId: A, isPrivate: false }));
});

test('publicReadable allows another authenticated user to read a public resource', () => {
  assert.doesNotThrow(() => publicReadable(ctxB, { userId: A, isPrivate: false }));
});

test('publicReadable allows an anonymous caller to read a public resource', () => {
  assert.doesNotThrow(() => publicReadable(anon, { userId: A, isPrivate: false }));
});

test('publicReadable throws FORBIDDEN when a non-owner reads a private resource', () => {
  assertAuthz(() => publicReadable(ctxB, { userId: A, isPrivate: true }), 'FORBIDDEN', [A, B]);
});

test('publicReadable throws FORBIDDEN when an anonymous caller reads a private resource', () => {
  assertAuthz(() => publicReadable(anon, { userId: A, isPrivate: true }), 'FORBIDDEN', [A]);
});

// --- canInsertFollow --------------------------------------------------------

test('canInsertFollow allows the follower to create their own edge', () => {
  assert.doesNotThrow(() => canInsertFollow(ctxA, { followerId: A }));
});

test('canInsertFollow throws FORBIDDEN when creating an edge for someone else', () => {
  assertAuthz(() => canInsertFollow(ctxA, { followerId: B }), 'FORBIDDEN', [A, B]);
});

test('canInsertFollow throws UNAUTHENTICATED for anonymous', () => {
  assertAuthz(() => canInsertFollow(anon, { followerId: A }), 'UNAUTHENTICATED', [A]);
});

// --- canInsertAiEvent -------------------------------------------------------

test('canInsertAiEvent allows the owner to append their own event', () => {
  assert.doesNotThrow(() => canInsertAiEvent(ctxA, { userId: A }));
});

test('canInsertAiEvent throws FORBIDDEN when appending an event for another user', () => {
  assertAuthz(() => canInsertAiEvent(ctxA, { userId: B }), 'FORBIDDEN', [A, B]);
});

test('canInsertAiEvent throws UNAUTHENTICATED for anonymous', () => {
  assertAuthz(() => canInsertAiEvent(anon, { userId: A }), 'UNAUTHENTICATED', [A]);
});

// --- canInsertWaitlist ------------------------------------------------------

test('canInsertWaitlist is always allowed, including anonymously', () => {
  assert.doesNotThrow(() => canInsertWaitlist());
});

// --- AuthzError shape -------------------------------------------------------

test('AuthzError is an Error with a code and a resource-free message', () => {
  const err = new AuthzError('FORBIDDEN');
  assert.ok(err instanceof Error);
  assert.ok(err instanceof AuthzError);
  assert.equal(err.code, 'FORBIDDEN');
  assert.equal(err.name, 'AuthzError');
  assert.ok(err.message.length > 0);
});
