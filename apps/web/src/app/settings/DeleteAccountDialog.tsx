'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken, typeRamp } from '@era/tokens';
import { transitionFor } from '../../lib/motion';
import { eraAuth } from '../../lib/auth-client';
import { GlassSheet } from '../../components/GlassSheet';
import { Input } from '../../components/Input';
import { SETTINGS_COPY } from './copy';

/** The delete request's lifecycle, driving the dialog's controls + copy. */
type Phase = 'idle' | 'submitting' | 'deleted';

export interface DeleteAccountDialogProps {
  /** The session's account email — the exact string the user must retype. */
  accountEmail: string;
}

/**
 * Account deletion — the App Store account-deletion requirement and the GDPR
 * right-to-erasure. A danger-styled row opens a frosted confirmation sheet that
 * stays disabled until the user retypes their exact account email, then POSTs
 * the pinned contract:
 *
 *   POST /api/delete-account { confirmEmail }  (same-origin, credentialed)
 *     200 { deleted, storageObjectsDeleted } → signOut() then redirect to /
 *     400 { error:'confirmation_mismatch' }   → inline "doesn't match" error
 *     401                                      → treat as signed out (→ /sign-in)
 *     500 { error:'deletion_failed' }          → error, and DO NOT sign out
 *
 * The typed match is a client convenience gate; the server re-checks the email
 * against the *session's* own address, so this can only ever delete the caller.
 */
export function DeleteAccountDialog({ accountEmail }: DeleteAccountDialogProps) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = typed.trim().toLowerCase() === accountEmail.trim().toLowerCase();
  const busy = phase === 'submitting' || phase === 'deleted';

  function close() {
    setOpen(false);
    setTyped('');
    setError(null);
    setPhase('idle');
  }

  // Focus the confirmation field when the sheet opens; close on Escape (unless a
  // deletion is mid-flight — you can't back out of an in-progress erase). The
  // effect depends only on `open`/`busy`; state setters are stable.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        setOpen(false);
        setTyped('');
        setError(null);
        setPhase('idle');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy]);

  async function confirmDelete() {
    if (!matches || busy) return;
    setPhase('submitting');
    setError(null);

    let res: Response;
    try {
      res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ confirmEmail: typed }),
      });
    } catch {
      // Network failure — nothing was deleted; let the user retry.
      setPhase('idle');
      setError(SETTINGS_COPY.deleteError);
      return;
    }

    if (res.ok) {
      // 200: the account is gone. Show the brief "deleted" beat while we clear
      // the client session and route home. The server already invalidated the
      // session rows; signOut() clears the cookie. Never block the redirect on it.
      setPhase('deleted');
      try {
        await eraAuth.signOut();
      } catch {
        // Cookie clear is best-effort — the server session is already dead.
      }
      router.replace('/');
      return;
    }

    if (res.status === 401) {
      // Already signed out on the server — treat as such.
      router.replace('/sign-in');
      return;
    }

    if (res.status === 400) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setPhase('idle');
      setError(
        body?.error === 'confirmation_mismatch'
          ? SETTINGS_COPY.deleteMismatch
          : SETTINGS_COPY.deleteError,
      );
      return;
    }

    // 500 (deletion_failed) or anything else: the erase did not complete, so we
    // deliberately do NOT sign out — the user stays put and can retry.
    setPhase('idle');
    setError(SETTINGS_COPY.deleteError);
  }

  return (
    <>
      <button type="button" style={triggerStyle} onClick={() => setOpen(true)}>
        {SETTINGS_COPY.deleteAccount}
      </button>

      {open ? (
        <>
          <motion.div
            style={backdropStyle}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={transitionFor(motionToken.springs.gentle, reduced)}
            onClick={busy ? undefined : close}
          />
          <GlassSheet labelledBy="delete-account-title">
            <div style={contentStyle}>
              <h2 id="delete-account-title" style={titleStyle}>
                {SETTINGS_COPY.deleteTitle}
              </h2>

              {phase === 'deleted' ? (
                <p role="status" style={bodyStyle}>
                  {SETTINGS_COPY.deleted}
                </p>
              ) : (
                <>
                  <p style={bodyStyle}>{SETTINGS_COPY.deleteBody}</p>
                  <p style={promptStyle}>{SETTINGS_COPY.deletePrompt(accountEmail)}</p>
                  <Input
                    ref={inputRef}
                    label={SETTINGS_COPY.deleteInputLabel}
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder={accountEmail}
                    value={typed}
                    disabled={busy}
                    error={error ?? undefined}
                    onChange={(event) => {
                      setTyped(event.target.value);
                      if (error) setError(null);
                    }}
                  />
                  <div style={actionsStyle}>
                    <button
                      type="button"
                      style={cancelStyle}
                      disabled={busy}
                      onClick={close}
                    >
                      {SETTINGS_COPY.cancel}
                    </button>
                    <button
                      type="button"
                      style={{
                        ...dangerStyle,
                        opacity: matches && !busy ? 1 : 0.5,
                        cursor: matches && !busy ? 'pointer' : 'not-allowed',
                      }}
                      disabled={!matches || busy}
                      onClick={confirmDelete}
                    >
                      {SETTINGS_COPY.deleteConfirmCta}
                    </button>
                  </div>
                </>
              )}
            </div>
          </GlassSheet>
        </>
      ) : null}
    </>
  );
}

// Danger row that opens the dialog — rust text, left-aligned like the other rows.
const triggerStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 'var(--touch-target-min)',
  padding: 0,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--color-rust)',
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  fontWeight: 600,
  textAlign: 'left',
};

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'color-mix(in srgb, var(--color-ink) 45%, transparent)',
  zIndex: 45,
};

const contentStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  paddingTop: 'var(--space-4)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.title2.rem,
  lineHeight: `${typeRamp.title2.lineHeight}px`,
  fontWeight: 700,
};

const bodyStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-text)',
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
};

const promptStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary-strong)',
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
};

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-3)',
  justifyContent: 'flex-end',
  alignItems: 'center',
};

const cancelStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'var(--touch-target-web)',
  paddingInline: 'var(--space-4)',
  borderRadius: 'var(--radius-input)',
  border: '1px solid var(--color-hairline)',
  background: 'transparent',
  color: 'var(--color-text)',
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  fontWeight: 600,
  cursor: 'pointer',
};

// Destructive confirm — rust outline + a faint rust wash. Outlined (not filled)
// so the rust label keeps its contrast in both themes with no hardcoded colour.
const dangerStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'var(--touch-target-web)',
  paddingInline: 'var(--space-4)',
  borderRadius: 'var(--radius-input)',
  border: '1px solid var(--color-rust)',
  background: 'color-mix(in srgb, var(--color-rust) 12%, transparent)',
  color: 'var(--color-rust)',
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  fontWeight: 700,
};
