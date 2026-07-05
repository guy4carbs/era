import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadServerEnv, loadWebClientEnv } from './env.ts';

/**
 * A complete, fake server environment. Values are obvious placeholders so that
 * a test failure can never leak a real secret. AFFILIATE_FEED_KEY is
 * deliberately omitted to exercise the optional path.
 */
function completeServerEnv(): Record<string, string> {
  return {
    DATABASE_URL: 'postgres://user:pass@ep-fake.neon.tech/era',
    BETTER_AUTH_SECRET: 'fake-auth-secret',
    BETTER_AUTH_URL: 'https://api.era.test',
    APPLE_OAUTH_CLIENT_ID: 'fake-apple-id',
    APPLE_OAUTH_CLIENT_SECRET: 'fake-apple-secret',
    GOOGLE_OAUTH_CLIENT_ID: 'fake-google-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'fake-google-secret',
    R2_ACCOUNT_ID: 'fake-r2-account',
    R2_ACCESS_KEY_ID: 'fake-r2-access-key',
    R2_SECRET_ACCESS_KEY: 'fake-r2-secret-key',
    R2_BUCKET_ITEMS_RAW: 'era-items-raw',
    R2_BUCKET_ITEMS_CUTOUT: 'era-items-cutout',
    R2_BUCKET_OUTFIT_COVERS: 'era-outfit-covers',
    R2_BUCKET_AVATARS: 'era-avatars',
    R2_PUBLIC_URL_CUTOUTS: 'https://pub-cutouts.r2.dev',
    R2_PUBLIC_URL_COVERS: 'https://pub-covers.r2.dev',
    ANTHROPIC_API_KEY: 'fake-anthropic-key',
    VISION_API_KEY: 'fake-vision-key',
    BG_REMOVAL_API_KEY: 'fake-bg-removal-key',
  };
}

test('loadServerEnv returns a typed object with optional AFFILIATE_FEED_KEY undefined', () => {
  const env = loadServerEnv(completeServerEnv());

  assert.equal(env.DATABASE_URL, 'postgres://user:pass@ep-fake.neon.tech/era');
  assert.equal(env.ANTHROPIC_API_KEY, 'fake-anthropic-key');
  assert.equal(env.AFFILIATE_FEED_KEY, undefined);
});

test('loadServerEnv throws naming every missing var without leaking values', () => {
  const source = completeServerEnv();
  // Capture secret values before deleting, so we can assert they never leak.
  const anthropicKey = source.ANTHROPIC_API_KEY;
  const authSecret = source.BETTER_AUTH_SECRET;
  assert.ok(anthropicKey);
  assert.ok(authSecret);
  delete source.DATABASE_URL;
  delete source.ANTHROPIC_API_KEY;

  assert.throws(
    () => loadServerEnv(source),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Invalid or missing environment variables/);
      assert.match(error.message, /DATABASE_URL/);
      assert.match(error.message, /ANTHROPIC_API_KEY/);
      // No provided secret value ever appears in the error.
      assert.ok(!error.message.includes(anthropicKey));
      assert.ok(!error.message.includes(authSecret));
      return true;
    },
  );
});

test('loadServerEnv throws when BETTER_AUTH_URL is not a URL, naming that var', () => {
  const source = completeServerEnv();
  source.BETTER_AUTH_URL = 'not-a-url';

  assert.throws(
    () => loadServerEnv(source),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /BETTER_AUTH_URL/);
      // The bad value must not be echoed back.
      assert.ok(!error.message.includes('not-a-url'));
      return true;
    },
  );
});

test('loadWebClientEnv parses a valid public env and rejects a missing one', () => {
  const env = loadWebClientEnv({
    NEXT_PUBLIC_API_URL: 'https://api.era.test',
    NEXT_PUBLIC_R2_PUBLIC_URL: 'https://cdn.era.test',
    NEXT_PUBLIC_SITE_URL: 'https://era.test',
  });
  assert.equal(env.NEXT_PUBLIC_API_URL, 'https://api.era.test');
  assert.equal(env.NEXT_PUBLIC_SITE_URL, 'https://era.test');
  // GSC verification is optional — omitted above, so it parses as undefined.
  assert.equal(env.NEXT_PUBLIC_GSC_VERIFICATION, undefined);

  assert.throws(
    () =>
      loadWebClientEnv({
        NEXT_PUBLIC_R2_PUBLIC_URL: 'https://cdn.era.test',
        NEXT_PUBLIC_SITE_URL: 'https://era.test',
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /NEXT_PUBLIC_API_URL/);
      return true;
    },
  );

  // NEXT_PUBLIC_SITE_URL is required — a missing one is named in the error.
  assert.throws(
    () =>
      loadWebClientEnv({
        NEXT_PUBLIC_API_URL: 'https://api.era.test',
        NEXT_PUBLIC_R2_PUBLIC_URL: 'https://cdn.era.test',
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /NEXT_PUBLIC_SITE_URL/);
      return true;
    },
  );
});
