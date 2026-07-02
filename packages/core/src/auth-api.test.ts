import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createEraAuthApi, type AuthClientLike } from './auth-api.ts';

/**
 * A recording fake of the Better Auth client. Captures the last call to each
 * method and returns a caller-supplied result, so a test can assert both the
 * forwarded arguments and the error-envelope handling.
 */
function fakeClient(result: unknown = { data: {}, error: null }): {
  client: AuthClientLike;
  calls: {
    magicLink: { email: string; callbackURL?: string } | null;
    social: { provider: string; callbackURL?: string } | null;
    signOut: number;
  };
} {
  const calls = {
    magicLink: null as { email: string; callbackURL?: string } | null,
    social: null as { provider: string; callbackURL?: string } | null,
    signOut: 0,
  };
  const client: AuthClientLike = {
    signIn: {
      async magicLink(options) {
        calls.magicLink = options;
        return result;
      },
      async social(options) {
        calls.social = options;
        return result;
      },
    },
    async signOut() {
      calls.signOut += 1;
      return result;
    },
  };
  return { client, calls };
}

// --- happy path: forwarding --------------------------------------------------

test('signInMagicLink forwards email and callbackURL to the client', async () => {
  const { client, calls } = fakeClient();
  const api = createEraAuthApi(client);

  await api.signInMagicLink('user@era.test', 'era://auth/callback');

  assert.deepEqual(calls.magicLink, { email: 'user@era.test', callbackURL: 'era://auth/callback' });
});

test('signInMagicLink works without a callbackURL', async () => {
  const { client, calls } = fakeClient();
  const api = createEraAuthApi(client);

  await api.signInMagicLink('user@era.test');

  assert.deepEqual(calls.magicLink, { email: 'user@era.test', callbackURL: undefined });
});

test('signInSocial forwards the provider', async () => {
  const { client, calls } = fakeClient();
  const api = createEraAuthApi(client);

  await api.signInSocial('apple', 'era://home');

  assert.deepEqual(calls.social, { provider: 'apple', callbackURL: 'era://home' });
});

test('signOut calls the client', async () => {
  const { client, calls } = fakeClient();
  const api = createEraAuthApi(client);

  await api.signOut();

  assert.equal(calls.signOut, 1);
});

// --- error envelopes ---------------------------------------------------------

test('signInMagicLink throws a readable Error from an error message', async () => {
  const { client } = fakeClient({ data: null, error: { message: 'rate limited', status: 429 } });
  const api = createEraAuthApi(client);

  await assert.rejects(
    () => api.signInMagicLink('user@era.test'),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Magic link sign-in failed: rate limited/);
      return true;
    },
  );
});

test('signInSocial falls back to the HTTP status when no message is present', async () => {
  const { client } = fakeClient({ data: null, error: { status: 500 } });
  const api = createEraAuthApi(client);

  await assert.rejects(
    () => api.signInSocial('google'),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Social sign-in failed: HTTP 500/);
      return true;
    },
  );
});

test('a null error envelope does not throw', async () => {
  const { client } = fakeClient({ data: { ok: true }, error: null });
  const api = createEraAuthApi(client);

  await assert.doesNotReject(() => api.signOut());
});

test('a non-object client result is treated as success', async () => {
  const { client } = fakeClient(undefined);
  const api = createEraAuthApi(client);

  await assert.doesNotReject(() => api.signInMagicLink('user@era.test'));
});
