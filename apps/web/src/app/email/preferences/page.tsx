/**
 * `/email/preferences?email=…&token=…` — the one quiet email-preferences page.
 *
 * Reached from The Era Edit's footer "Preferences" link. No session — authorized
 * by the signed token bound to the address (`lib/email-links.ts`). An invalid or
 * missing token renders a calm error with no controls. A valid one shows the
 * address and a single toggle row for The Era Edit (subscribed = not manually
 * unsubscribed), as a form that POSTs to `/api/email/preferences`; that route
 * flips the state and redirects back here with `?saved=1` for a quiet
 * confirmation line.
 *
 * Server component: the human-driven POST needs no client JS. The `Text` /
 * `Button` primitives it composes are the client islands at the RSC boundary.
 * `noindex` — a private, per-recipient surface.
 */
import type { CSSProperties } from 'react';
import type { Metadata } from 'next';

import { createDbClient } from '@era/db';

import { Button, Container } from '../../../components';
import { Text } from '../../../components/Text';
import { addSuppression, isManuallySuppressed, removeSuppression } from '../../../lib/email-suppression.ts';
import { loadPreferences } from '../../../lib/email-preferences.ts';

export const metadata: Metadata = {
  title: 'Email preferences',
  robots: { index: false, follow: false },
};

// A per-recipient surface — must render at request time, never cached.
export const dynamic = 'force-dynamic';

const db = createDbClient(process.env.DATABASE_URL!);

export default async function EmailPreferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string | string[]; token?: string | string[]; saved?: string | string[] }>;
}) {
  const params = await searchParams;
  // Repeated params yield arrays; only a single string is ever valid.
  const email = Array.isArray(params.email) ? undefined : params.email;
  const token = Array.isArray(params.token) ? undefined : params.token;
  const saved = (Array.isArray(params.saved) ? params.saved[0] : params.saved) === '1';

  const view = await loadPreferences(email ?? null, token ?? null, {
    isManuallyUnsubscribed: (addr) => isManuallySuppressed(db, addr),
    // These writes are unused on the read path; supplied to satisfy the deps shape.
    subscribe: (addr) => removeSuppression(db, addr),
    unsubscribe: (addr) => addSuppression(db, addr, 'manual'),
  });

  if (view.kind === 'invalid') {
    return (
      <Container>
        <main style={screenStyle}>
          <Text variant="largeTitle" as="h1" style={{ margin: 0 }}>
            Email preferences.
          </Text>
          <Text variant="body" as="p" style={mutedStyle}>
            This preferences link isn&rsquo;t valid. It may have expired or been altered. Open the
            latest email from Era and use its link.
          </Text>
        </main>
      </Container>
    );
  }

  // The one toggle: subscribing sends 'subscribe', unsubscribing sends
  // 'unsubscribe' — a single form whose hidden action mirrors the CURRENT state's
  // opposite. The email + token round-trip through the POST so it stays authorized.
  const nextAction = view.subscribed ? 'unsubscribe' : 'subscribe';
  const buttonLabel = view.subscribed ? 'Unsubscribe' : 'Resubscribe';

  return (
    <Container>
      <main style={screenStyle}>
        <Text variant="largeTitle" as="h1" style={{ margin: 0 }}>
          Email preferences.
        </Text>

        <Text variant="body" as="p" style={mutedStyle}>
          {view.email}
        </Text>

        <div style={rowStyle}>
          <Text variant="body" as="p" style={{ margin: 0 }}>
            {view.subscribed
              ? 'You’re subscribed to The Era Edit.'
              : 'You’re not subscribed to The Era Edit.'}
          </Text>
          <form method="post" action="/api/email/preferences">
            <input type="hidden" name="email" value={view.email} />
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="action" value={nextAction} />
            <Button type="submit" variant={view.subscribed ? 'secondary' : 'primary'}>
              {buttonLabel}
            </Button>
          </form>
        </div>

        {saved ? (
          <Text variant="caption" as="p" style={mutedStyle}>
            Saved.
          </Text>
        ) : null}
      </main>
    </Container>
  );
}

const screenStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  paddingBlock: 'var(--space-8)',
  maxWidth: 'var(--feed-col)',
};

const mutedStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary)',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  alignItems: 'flex-start',
  paddingBlock: 'var(--space-3)',
  borderTop: '1px solid var(--color-hairline)',
  borderBottom: '1px solid var(--color-hairline)',
};
