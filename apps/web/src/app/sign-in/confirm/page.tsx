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
 *
 * Server component on purpose (the human-driven POST needs no client JS); the
 * design-system primitives it composes (`Text`, `Button`) are client components
 * and form the RSC boundary.
 */
import type { CSSProperties } from 'react';
import type { Metadata } from 'next';

import { Button, Container } from '../../../components';
import { Text } from '../../../components/Text';
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
      <Container>
        <main style={screenStyle}>
          <header style={headerStyle}>
            <Text variant="largeTitle" as="h1" style={{ margin: 0 }}>
              This link isn&rsquo;t valid
            </Text>
            <Text variant="body" as="p" style={subtitleStyle}>
              We couldn&rsquo;t confirm this sign-in link. It may have expired or
              been altered. Head back and request a fresh one.
            </Text>
          </header>
          <a href="/sign-in" style={linkStyle}>
            <Text variant="ui" as="span" style={{ color: 'var(--color-text)' }}>
              Back to sign in
            </Text>
          </a>
        </main>
      </Container>
    );
  }

  return (
    <Container>
      <main style={screenStyle}>
        <header style={headerStyle}>
          <Text variant="largeTitle" as="h1" style={{ margin: 0 }}>
            You&rsquo;re almost in
          </Text>
          <Text variant="body" as="p" style={subtitleStyle}>
            Confirm it&rsquo;s really you to finish signing in to Era.
          </Text>
        </header>
        <form method="post" action="/api/auth/confirm-signin" style={formStyle}>
          <input type="hidden" name="next" value={safeNext} />
          <Button type="submit" variant="primary" style={fullWidthStyle}>
            Sign in to Era
          </Button>
        </form>
      </main>
    </Container>
  );
}

const screenStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-8)',
  paddingBlock: 'var(--space-8)',
  maxWidth: 'var(--feed-col)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

const subtitleStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary)',
};

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

const fullWidthStyle: CSSProperties = {
  width: '100%',
};

const linkStyle: CSSProperties = {
  textDecoration: 'none',
  alignSelf: 'flex-start',
  minHeight: 'var(--touch-target-min)',
  display: 'inline-flex',
  alignItems: 'center',
};
