'use client';

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { strings } from '@era/core/strings';
import { Button, Input, glassSurfaceStyle } from '../index';
import { track } from '../../lib/analytics';
import { PostSignupReferral } from './PostSignupReferral';

/** The waitlist join response, per Forge's `POST /api/waitlist` contract. */
interface JoinResult {
  referralCode: string;
  alreadyJoined: boolean;
}

type Status = 'idle' | 'submitting' | 'error';

/**
 * Layout register. `stacked` (default) is the vertical column the Closer uses;
 * `bar` is the hero's glass row — a frosted pill holding a borderless input and
 * the accent submit side by side. Purely a layout choice: the submit/error/
 * success behaviour is identical across both.
 */
export type WaitlistFormVariant = 'stacked' | 'bar';

export interface WaitlistFormProps {
  variant?: WaitlistFormVariant;
}

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

// The hero 'bar' register: a frosted glass pill wrapping the field + submit on
// one row. Composes the ONE glass recipe (blur + tint + hairline + top
// highlight) at input radius, with a hair of inner padding so the borderless
// field and the accent button sit flush inside the pill.
const barWrapStyle: CSSProperties = {
  ...glassSurfaceStyle({ shadow: 'e3', radius: 'var(--radius-input)' }),
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--space-2)',
  width: '100%',
  padding: 'var(--space-2)',
};

// The field flexes to fill the pill; the row wrapper carries the glass, so the
// input drops its own border/shadow/surface and reads as part of the bar.
const barFieldWrapStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const barInputStyle: CSSProperties = {
  border: 'none',
  boxShadow: 'none',
  background: 'transparent',
};

/**
 * The waitlist capture island. Reads an optional `?ref=` from the URL and sends
 * it with the join so referral credit is attributed. On success it swaps to the
 * {@link PostSignupReferral} view. Error responses are surfaced inline in the
 * field without leaving the aesthetic: 400 → "enter a valid email", 429 → a
 * gentle "try again". Fires the `waitlist_signup` funnel event on a successful join.
 */
export function WaitlistForm({ variant = 'stacked' }: WaitlistFormProps = {}) {
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

  // The field + submit are identical across both registers — only the wrapping
  // layout differs (stacked column vs. the hero's glass pill).
  const field = (
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
      style={variant === 'bar' ? barInputStyle : undefined}
    />
  );
  const submit = (
    <Button type="submit" disabled={status === 'submitting'}>
      {strings.site.form.cta}
    </Button>
  );

  if (variant === 'bar') {
    return (
      <form style={formStyle} onSubmit={onSubmit} noValidate>
        <div style={barWrapStyle}>
          <div style={barFieldWrapStyle}>{field}</div>
          {submit}
        </div>
      </form>
    );
  }

  return (
    <form style={formStyle} onSubmit={onSubmit} noValidate>
      {field}
      {submit}
    </form>
  );
}
