import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { createDbClient, profiles } from '@era/db';

import { auth } from '../../lib/auth';
import { SettingsScreen } from './SettingsScreen';
import { SETTINGS_COPY } from './copy';

export const metadata: Metadata = {
  title: `${SETTINGS_COPY.title} — Era`,
  description: 'Manage your Era account, appearance, closet privacy, and data.',
};

const db = createDbClient(process.env.DATABASE_URL!);

/**
 * `/settings` — an authed, standalone screen (outside the tab shell). Gated with
 * the same server session helper the API routes use: an unresolved or missing
 * session redirects to `/sign-in`. The session's email is read here and handed
 * to the delete-confirm gate; closet privacy is seeded server-side so the toggle
 * lands without a flash. A momentary auth/DB hiccup is treated as signed out
 * rather than 500ing the page.
 */
export default async function SettingsPage() {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> = null;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch {
    session = null;
  }
  if (!session) {
    redirect('/sign-in');
  }

  // Seed the closet-privacy toggle from the owner's own profile row (keyed by the
  // session user id — a caller can only ever read their own). Defaults to private
  // if the row is momentarily unreadable, matching the GET /privacy fallback.
  let initialIsPrivate = true;
  try {
    const [profile] = await db
      .select({ isPrivate: profiles.isPrivate })
      .from(profiles)
      .where(eq(profiles.userId, session.user.id))
      .limit(1);
    initialIsPrivate = profile?.isPrivate ?? true;
  } catch {
    initialIsPrivate = true;
  }

  return <SettingsScreen accountEmail={session.user.email} initialIsPrivate={initialIsPrivate} />;
}
