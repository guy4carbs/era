import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { auth } from '../../lib/auth';
import { WornScreen } from '../../components/worn';

export const metadata: Metadata = {
  title: 'Your wear calendar — Era',
  description: 'A month of what you wore, with cost per wear and a shareable recap.',
};

/**
 * `/worn` — the authed wear-calendar screen (outside the tab shell, like
 * `/settings`). Gated with the same server session helper the API routes use: an
 * unresolved or missing session redirects to `/sign-in`. A momentary auth hiccup
 * is treated as signed out rather than 500ing the page. The month data itself is
 * fetched client-side by {@link WornScreen} (owner-scoped by session cookie).
 */
export default async function WornPage() {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> = null;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch {
    session = null;
  }
  if (!session) {
    redirect('/sign-in');
  }

  return <WornScreen />;
}
