'use client';

import { useState, type FormEvent } from 'react';
import { eraAuth } from '../../lib/auth-client';

type SendState = 'idle' | 'sending' | 'sent';

/** The Era auth API throws a readable Error on failure; fall back if it's opaque. */
function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

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

  return (
    <main className="page">
      <h1>Sign in to Era</h1>

      {sendState === 'sent' ? (
        <p>
          Check your inbox — we sent a magic link to <strong>{email.trim()}</strong>.
        </p>
      ) : (
        <form className="field" onSubmit={sendMagicLink}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button className="btn" type="submit" disabled={sendState === 'sending'}>
            {sendState === 'sending' ? 'Sending…' : 'Send magic link'}
          </button>
        </form>
      )}

      <p>or</p>

      <button className="btn btn-secondary" type="button" onClick={() => continueWith('apple')}>
        Continue with Apple
      </button>
      <button className="btn btn-secondary" type="button" onClick={() => continueWith('google')}>
        Continue with Google
      </button>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </main>
  );
}
