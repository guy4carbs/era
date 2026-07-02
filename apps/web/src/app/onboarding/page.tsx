'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
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
      <main className="page">
        <p>Loading…</p>
      </main>
    );
  }

  const canSubmit = availability === 'available' && !submitting;

  return (
    <main className="page">
      <h1>Pick a username</h1>
      <p>This is how other people will find you on Era.</p>

      <form className="field" onSubmit={submit}>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          className="input"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="yourname"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        {availability === 'checking' ? <span className="hint">Checking…</span> : null}
        {availability === 'available' ? <span className="hint hint-ok">Available</span> : null}
        {availability === 'taken' ? (
          <span className="hint hint-bad">That username is taken.</span>
        ) : null}
        {availability === 'invalid' ? (
          <span className="hint hint-bad">3–20 characters: letters, numbers, or underscores.</span>
        ) : null}

        <button className="btn" type="submit" disabled={!canSubmit}>
          {submitting ? 'Saving…' : 'Claim username'}
        </button>
      </form>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </main>
  );
}
