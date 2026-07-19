'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';
import { Button, Container } from '../../components';
import { Input } from '../../components/Input';
import { Text } from '../../components/Text';
import { eraAuth } from '../../lib/auth-client';

type SendState = 'idle' | 'sending' | 'sent';

/** The Era auth API throws a readable Error on failure; fall back if it's opaque. */
function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * The web sign-in surface — the first screen a signed-out visitor meets, so it
 * carries the full design system rather than the pre-foundation stub it replaced.
 * Mirrors the mobile twin (`apps/mobile/app/sign-in.tsx`): the `era` wordmark in
 * the serif largeTitle, a calm one-line subtitle, then the magic-link form and the
 * two social providers — all through the `Input`/`Button` primitives on token
 * surfaces, so it renders correctly in light and dark and honours reduced motion
 * (the press/hover affordances live in `Button`).
 */
export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [sendState, setSendState] = useState<SendState>('idle');
  const [error, setError] = useState<string | null>(null);

  async function sendMagicLink(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSendState('sending');
    try {
      await eraAuth.signInMagicLink(email.trim(), '/onboarding');
      setSendState('sent');
    } catch (err) {
      setError(messageFrom(err, 'Could not send the magic link. Please try again.'));
      setSendState('idle');
    }
  }

  async function continueWith(provider: 'apple' | 'google') {
    setError(null);
    try {
      await eraAuth.signInSocial(provider, '/onboarding');
    } catch (err) {
      const label = provider === 'apple' ? 'Apple' : 'Google';
      setError(messageFrom(err, `Could not continue with ${label}.`));
    }
  }

  const sending = sendState === 'sending';

  return (
    <Container>
      <main style={screenStyle}>
        <header style={headerStyle}>
          <Text variant="largeTitle" as="h1" style={{ margin: 0 }}>Era</Text>
          <Text variant="body" as="p" style={{ margin: 0, color: 'var(--color-secondary)' }}>
            Your wardrobe, styled.
          </Text>
        </header>

        <div style={formStyle}>
          {sendState === 'sent' ? (
            <Text variant="body" as="p" role="status" style={{ margin: 0, color: 'var(--color-text)' }}>
              Check your inbox — we sent a magic link to{' '}
              <Text variant="body" as="span" weight={600} style={{ color: 'var(--color-text)' }}>
                {email.trim()}
              </Text>
              .
            </Text>
          ) : (
            <form style={formStyle} onSubmit={sendMagicLink}>
              <Input
                label="Email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                placeholder="you@example.com"
                value={email}
                disabled={sending}
                error={error ?? undefined}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Button type="submit" variant="primary" disabled={sending} style={fullWidthStyle}>
                {sending ? 'Sending…' : 'Send magic link'}
              </Button>
            </form>
          )}

          <div style={dividerStyle} aria-hidden="true">
            <span style={ruleStyle} />
            <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-secondary-strong)' }}>or</Text>
            <span style={ruleStyle} />
          </div>

          <Button variant="secondary" onClick={() => void continueWith('apple')} style={fullWidthStyle}>
            Continue with Apple
          </Button>
          <Button variant="secondary" onClick={() => void continueWith('google')} style={fullWidthStyle}>
            Continue with Google
          </Button>

          {/* The magic-link error routes through the Input above; a social-provider
              error has no field, so it surfaces here as a rust caption. */}
          {error && sendState === 'sent' ? (
            <Text variant="caption" as="p" size="footnote" role="alert" style={{ margin: 0, color: 'var(--color-rust)' }}>
              {error}
            </Text>
          ) : null}
        </div>
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

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

const fullWidthStyle: CSSProperties = {
  width: '100%',
};

const dividerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
};

const ruleStyle: CSSProperties = {
  flex: 1,
  height: '1px',
  background: 'var(--color-hairline)',
};
