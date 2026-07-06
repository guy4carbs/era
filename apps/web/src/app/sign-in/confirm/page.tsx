/**
 * Magic-link confirm interstitial.
 *
 * The passwordless email links HERE, not at Better Auth's GET verify endpoint,
 * because email clients (Gmail) pre-fetch links to scan them — and that prefetch
 * would consume the single-use token before the human clicks. This page renders
 * a button whose only route onward is a human-driven POST to
 * `/api/auth/confirm-signin` (see the route). A GET prefetch renders the button
 * but never submits it, so the token survives until the person taps it.
 *
 * The `next` URL (Better Auth's verify URL, carried from the email) is validated
 * SAME-ORIGIN + EXACT verify path via `validateMagicLinkNext` before we render
 * the form. An invalid `next` renders an error with NO button — the open-redirect
 * is closed here, and re-closed in the POST route as defense in depth.
 */
import type { Metadata } from 'next';

import { validateMagicLinkNext } from '../../../lib/magic-link-confirm.ts';
import { siteUrl } from '../../../lib/site-url.ts';

// The confirm step is a private auth hop, never something to index.
export const metadata: Metadata = {
  title: 'Confirm sign-in',
  robots: { index: false, follow: false },
};

export default async function ConfirmSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  // A repeated ?next= yields an array; only a single string is ever valid.
  const candidate = Array.isArray(next) ? undefined : next;
  const safeNext = validateMagicLinkNext(candidate, new URL(siteUrl()).origin);

  if (!safeNext) {
    return (
      <main className="page">
        <h1>This link isn&rsquo;t valid</h1>
        <p>
          We couldn&rsquo;t confirm this sign-in link. It may have expired or been
          altered. Head back and request a fresh one.
        </p>
        <a className="link" href="/sign-in">
          Back to sign in
        </a>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>You&rsquo;re almost in</h1>
      <p>Confirm it&rsquo;s really you to finish signing in to Era.</p>
      <form className="field" method="post" action="/api/auth/confirm-signin">
        <input type="hidden" name="next" value={safeNext} />
        <button className="btn" type="submit">
          Sign in to Era
        </button>
      </form>
    </main>
  );
}
