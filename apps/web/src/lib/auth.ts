/**
 * Better Auth server instance for Era.
 *
 * This is the ONE place the server-side auth surface is configured. It wires
 * Better Auth to our Drizzle/Neon database, enables the passwordless magic-link
 * flow, conditionally registers Apple/Google social providers, and — on first
 * sign-in — provisions the user's `profiles` row.
 *
 * Security posture (see the repo's Security section):
 *   - Secrets are read from the server environment only; nothing here reaches a
 *     client bundle.
 *   - Placeholder OAuth credentials from `.env.example` MUST NOT register a
 *     provider — a half-configured provider is worse than an absent one.
 *   - In production the magic-link token/url is NEVER logged; the dev flow logs
 *     a single greppable line so local sign-in works without an email provider.
 */
import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';

import { createDbClient, account, profiles, session, user, verification } from '@era/db';

const db = createDbClient(process.env.DATABASE_URL!);

const isProduction = process.env.NODE_ENV === 'production';

/**
 * True only for a real, operator-supplied credential. The committed
 * `.env.example` ships obvious placeholders (`change-me-…`, `com.example.…`);
 * treating those as configured would register a provider that can only fail, so
 * we reject them explicitly and leave the provider off.
 */
function isRealCredential(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  return !value.startsWith('change-me') && !value.startsWith('com.example');
}

/**
 * Build the `socialProviders` config, including a provider ONLY when both its id
 * and secret are real. A provider with a placeholder on either side is omitted.
 */
function socialProviders(): Record<string, { clientId: string; clientSecret: string }> {
  const providers: Record<string, { clientId: string; clientSecret: string }> = {};

  const appleId = process.env.APPLE_OAUTH_CLIENT_ID;
  const appleSecret = process.env.APPLE_OAUTH_CLIENT_SECRET;
  if (isRealCredential(appleId) && isRealCredential(appleSecret)) {
    providers.apple = { clientId: appleId, clientSecret: appleSecret };
  }

  const googleId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const googleSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (isRealCredential(googleId) && isRealCredential(googleSecret)) {
    providers.google = { clientId: googleId, clientSecret: googleSecret };
  }

  return providers;
}

/** Derive the default username seed from a user id: alphanumerics only, 12 chars. */
function usernameSeed(userId: string): string {
  return `user_${userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12).toLowerCase()}`;
}

/** Four random hex chars, appended to a username to break a collision. */
function randomSuffix(): string {
  return Math.floor(Math.random() * 0x10000)
    .toString(16)
    .padStart(4, '0');
}

/**
 * Provision the 1:1 `profiles` row for a freshly-created user. Runs in the
 * user.create.after hook.
 *
 * Invariants:
 *   - Sign-in MUST NOT fail if this insert races or errors — a missing profile
 *     is recoverable later; a blocked sign-in is not. So every path swallows and
 *     logs rather than throwing.
 *   - The userId PK is guarded with onConflictDoNothing (idempotent if the hook
 *     runs twice / two requests race).
 *   - A username UNIQUE collision (different constraint than the PK) surfaces as
 *     a thrown insert; we retry exactly once with a random suffix appended.
 */
async function createProfileForUser(userId: string): Promise<void> {
  try {
    await db
      .insert(profiles)
      .values({ userId, username: usernameSeed(userId), isPrivate: true })
      .onConflictDoNothing({ target: profiles.userId });
  } catch {
    // Most likely a username UNIQUE violation. Retry once with a random suffix.
    try {
      await db
        .insert(profiles)
        .values({ userId, username: `${usernameSeed(userId)}${randomSuffix()}`, isPrivate: true })
        .onConflictDoNothing({ target: profiles.userId });
    } catch (retryError) {
      // Give up quietly — never block sign-in on profile provisioning.
      console.error(`[era-auth] failed to provision profile for user ${userId}:`, retryError);
    }
  }
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification },
  }),
  socialProviders: socialProviders(),
  // era:// is the Expo deep-link scheme; exp:// covers Expo Go during dev.
  trustedOrigins: ['era://', 'exp://'],
  plugins: [
    expo(),
    magicLink({
      async sendMagicLink({ email, url }) {
        if (isProduction) {
          // No email provider is wired yet. Fail loudly rather than silently
          // dropping the link — and NEVER log the token/url in production.
          throw new Error('email provider not wired yet');
        }
        // Dev-only: emit a single greppable line so local sign-in works without
        // an email provider. Gauge's E2E reads this exact format.
        console.log(`[era-auth] magic link for ${email}: ${url}`);
      },
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          await createProfileForUser(createdUser.id);
        },
      },
    },
  },
});

export type Auth = typeof auth;
export type Session = Auth['$Infer']['Session'];
