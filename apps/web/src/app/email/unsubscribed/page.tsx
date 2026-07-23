/**
 * `/email/unsubscribed` — the calm landing after a one-click unsubscribe.
 *
 * The unsubscribe route (`/api/email/unsubscribe`) verifies the signed link,
 * suppresses the address, and 303-redirects here. So this page asserts nothing
 * and does no work — it's the quiet confirmation, in Era's voice: one serif line
 * and one Geist line, no win-back guilt, no button. Server component; `noindex`
 * (a private post-action surface).
 */
import type { CSSProperties } from 'react';
import type { Metadata } from 'next';

import { Container } from '../../../components';
import { Text } from '../../../components/Text';

export const metadata: Metadata = {
  title: 'Unsubscribed',
  robots: { index: false, follow: false },
};

export default function UnsubscribedPage() {
  return (
    <Container>
      <main style={screenStyle}>
        <Text variant="largeTitle" as="h1" style={{ margin: 0 }}>
          You&rsquo;re unsubscribed.
        </Text>
        <Text variant="body" as="p" style={bodyStyle}>
          The Era Edit won&rsquo;t visit this inbox again.
        </Text>
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

const bodyStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary)',
};
