'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Button, Container } from '../../components';
import { Input } from '../../components/Input';
import { Text } from '../../components/Text';
import { useSession } from '../../lib/auth-client';

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

// Mirrors @era/core's isValidUsername (3–20 chars, letters/digits/underscore).
// The server is the source of truth; this only drives instant client feedback.
const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/i;

/** Shape of Forge's GET /api/username/check response. */
interface CheckResponse {
  available: boolean;
  reason?: 'invalid' | 'taken';
}

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [username, setUsername] = useState('');
  const [availability, setAvailability] = useState<Availability>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only a signed-in user can claim a username; bounce everyone else to sign-in.
  useEffect(() => {
    if (isPending) return;
    if (!session) router.replace('/sign-in');
  }, [isPending, session, router]);

  // Debounced live availability check against Forge's endpoint.
  useEffect(() => {
    const candidate = username.trim();
    if (candidate.length === 0) {
      setAvailability('idle');
      return;
    }
    if (!USERNAME_PATTERN.test(candidate)) {
      setAvailability('invalid');
      return;
    }
    setAvailability('checking');
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/username/check?u=${encodeURIComponent(candidate)}`, {
            signal: controller.signal,
          });
          if (!res.ok) {
            setAvailability('idle');
            return;
          }
          const body = (await res.json()) as CheckResponse;
          if (body.available) {
            setAvailability('available');
          } else {
            setAvailability(body.reason === 'invalid' ? 'invalid' : 'taken');
          }
        } catch {
          if (!controller.signal.aborted) setAvailability('idle');
        }
      })();
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [username]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const candidate = username.trim();
    if (!USERNAME_PATTERN.test(candidate)) {
      setAvailability('invalid');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/profile/username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: candidate }),
      });
      if (res.status === 409) {
        setAvailability('taken');
        setSubmitting(false);
        return;
      }
      if (res.status === 401) {
        router.replace('/sign-in');
        return;
      }
      if (!res.ok) {
        setError('Could not save that username. Please try again.');
        setSubmitting(false);
        return;
      }
      // Fresh users land straight in the style quiz to seed their starter era.
      router.replace('/quiz');
    } catch {
      setError('Could not save that username. Please try again.');
      setSubmitting(false);
    }
  }

  // Hold the form back until the auth gate above has resolved.
  if (isPending || !session) {
    return (
      <Container>
        <main style={screenStyle}>
          <Text variant="body" as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>Loading…</Text>
        </main>
      </Container>
    );
  }

  const canSubmit = availability === 'available' && !submitting;

  // A blocking hint (taken / invalid) recolours the field via the Input's error
  // slot; the transient positive states (checking / available) read as sage/quiet
  // captions below it so the field border isn't flagged for a non-error.
  const fieldError =
    availability === 'taken'
      ? 'That username is taken.'
      : availability === 'invalid'
        ? '3–20 characters: letters, numbers, or underscores.'
        : undefined;

  return (
    <Container>
      <main style={screenStyle}>
        <header style={headerStyle}>
          <Text variant="largeTitle" as="h1" style={{ margin: 0 }}>Pick a username</Text>
          <Text variant="body" as="p" style={{ margin: 0, color: 'var(--color-secondary)' }}>
            This is how other people will find you on Era.
          </Text>
        </header>

        <form style={formStyle} onSubmit={submit}>
          <div style={fieldStyle}>
            <Input
              label="Username"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="yourname"
              value={username}
              error={fieldError}
              onChange={(event) => setUsername(event.target.value)}
            />
            {availability === 'checking' ? (
              <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-secondary-strong)' }}>Checking…</Text>
            ) : null}
            {availability === 'available' ? (
              <Text variant="caption" as="span" size="footnote" weight={600} style={{ color: 'var(--color-sage)' }}>Available</Text>
            ) : null}
          </div>

          <Button type="submit" variant="primary" disabled={!canSubmit} style={fullWidthStyle}>
            {submitting ? 'Saving…' : 'Claim username'}
          </Button>
        </form>

        {error ? (
          <Text variant="caption" as="p" size="footnote" role="alert" style={{ margin: 0, color: 'var(--color-rust)' }}>
            {error}
          </Text>
        ) : null}
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

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

const fullWidthStyle: CSSProperties = {
  width: '100%',
};
