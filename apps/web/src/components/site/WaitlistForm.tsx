'use client';

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { strings } from '@era/core/strings';
import { Button, Input } from '../index';
import { track } from '../../lib/analytics';
import { PostSignupReferral } from './PostSignupReferral';

/** The waitlist join response, per Forge's `POST /api/waitlist` contract. */
interface JoinResult {
  referralCode: string;
  alreadyJoined: boolean;
}

type Status = 'idle' | 'submitting' | 'error';

// Inline error micro-copy — not in the locked deck yet (candidate for Quill).
// Named so a future `strings.site.form.error*` can drop in cleanly.
const ERROR_INVALID = 'Enter a valid email.';
const ERROR_RATE_LIMITED = 'One sec — try that again in a moment.';
const ERROR_GENERIC = 'Something went wrong. Please try again.';

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  width: '100%',
};

/**
 * The waitlist capture island. Reads an optional `?ref=` from the URL and sends
 * it with the join so referral credit is attributed. On success it swaps to the
 * {@link PostSignupReferral} view. Error responses are surfaced inline in the
 * field without leaving the aesthetic: 400 → "enter a valid email", 429 → a
 * gentle "try again". Fires the `waitlist_signup` funnel event on a successful join.
 */
export function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [ref, setRef] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JoinResult | null>(null);

  // Pull the referral code off the URL once, client-side, so the page itself
  // stays statically renderable (no useSearchParams dynamic bail-out).
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('ref');
    if (code) setRef(code);
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'submitting') return;
    setStatus('submitting');
    setError(null);

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), ...(ref ? { ref } : {}) }),
      });

      if (response.status === 400) {
        setError(ERROR_INVALID);
        setStatus('error');
        return;
      }
      if (response.status === 429) {
        setError(ERROR_RATE_LIMITED);
        setStatus('error');
        return;
      }
      if (!response.ok) {
        setError(ERROR_GENERIC);
        setStatus('error');
        return;
      }

      const data = (await response.json()) as JoinResult;
      track('waitlist_signup', { alreadyJoined: data.alreadyJoined });
      setResult(data);
    } catch {
      setError(ERROR_GENERIC);
      setStatus('error');
    }
  }

  if (result) {
    return (
      <PostSignupReferral referralCode={result.referralCode} alreadyJoined={result.alreadyJoined} />
    );
  }

  return (
    <form style={formStyle} onSubmit={onSubmit} noValidate>
      <Input
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        aria-label="Email address"
        placeholder={strings.site.form.emailPlaceholder}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={status === 'error' ? (error ?? undefined) : undefined}
        disabled={status === 'submitting'}
      />
      <Button type="submit" disabled={status === 'submitting'}>
        {strings.site.form.cta}
      </Button>
    </form>
  );
}
