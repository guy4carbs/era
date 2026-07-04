'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken, boxShadows, spacing, typeRamp } from '@era/tokens';
import { transitionFor } from '../../lib/motion';
import { useTheme, type ThemeMode } from '../../lib/theme';
import { eraAuth } from '../../lib/auth-client';
import { Container } from '../../components';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import { SETTINGS_COPY, SUPPORT_MAILTO } from './copy';

export interface SettingsScreenProps {
  /** The session's account email — passed to the delete-confirm gate. */
  accountEmail: string;
  /** Server-seeded closet privacy, so the toggle lands with no flash. */
  initialIsPrivate: boolean;
}

/**
 * The authed Settings screen. A standalone surface (outside the tab shell) that
 * gathers the account-level controls: appearance (theme), closet privacy,
 * support + legal links, sign out, and the destructive delete-account flow. All
 * dimensions and colours come from tokens; motion collapses under reduced-motion.
 */
export function SettingsScreen({ accountEmail, initialIsPrivate }: SettingsScreenProps) {
  const router = useRouter();

  async function handleSignOut() {
    try {
      await eraAuth.signOut();
    } catch {
      // Best-effort; route home regardless so the user leaves the authed surface.
    }
    router.replace('/');
  }

  return (
    <Container>
      <main style={screenStyle}>
        <header style={headerStyle}>
          <Link href="/closet" aria-label={`Back to ${SETTINGS_COPY.back}`} style={backStyle}>
            <span aria-hidden="true">←</span>
            {SETTINGS_COPY.back}
          </Link>
          <h1 style={titleStyle}>{SETTINGS_COPY.title}</h1>
        </header>

        <Section title={SETTINGS_COPY.appearance}>
          <Row label={SETTINGS_COPY.themeLabel}>
            <ThemeControl />
          </Row>
        </Section>

        <Section title={SETTINGS_COPY.privacy}>
          <PrivacyControl initialIsPrivate={initialIsPrivate} />
        </Section>

        <Section title={SETTINGS_COPY.support}>
          <a href={SUPPORT_MAILTO} style={linkRowStyle}>
            <span style={rowLabelStyle}>{SETTINGS_COPY.contactSupport}</span>
            <span style={rowHintStyle}>{SETTINGS_COPY.contactSupportHint}</span>
          </a>
        </Section>

        <Section title={SETTINGS_COPY.legal}>
          <Link href="/privacy" style={navRowStyle}>
            <span style={rowLabelStyle}>{SETTINGS_COPY.privacyPolicy}</span>
            <span aria-hidden="true" style={chevronStyle}>
              →
            </span>
          </Link>
          <Link href="/terms" style={navRowStyle}>
            <span style={rowLabelStyle}>{SETTINGS_COPY.terms}</span>
            <span aria-hidden="true" style={chevronStyle}>
              →
            </span>
          </Link>
        </Section>

        <Section title={SETTINGS_COPY.account}>
          <p style={rowHintStyle}>{SETTINGS_COPY.signedInAs(accountEmail)}</p>
          <button type="button" style={signOutStyle} onClick={handleSignOut}>
            {SETTINGS_COPY.signOut}
          </button>
          <DeleteAccountDialog accountEmail={accountEmail} />
        </Section>
      </main>
    </Container>
  );
}

/** A titled group of settings rows, separated by a hairline. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={sectionStyle}>
      <h2 style={sectionHeadingStyle}>{title}</h2>
      <div style={sectionBodyStyle}>{children}</div>
    </section>
  );
}

/** A label-left / control-right row. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={rowStyle}>
      <span style={rowLabelStyle}>{label}</span>
      {children}
    </div>
  );
}

/** System / Light / Dark segmented control over the existing theme provider. */
function ThemeControl() {
  const { mode, setMode } = useTheme();
  const options: { id: ThemeMode; label: string }[] = [
    { id: 'system', label: SETTINGS_COPY.themeSystem },
    { id: 'light', label: SETTINGS_COPY.themeLight },
    { id: 'dark', label: SETTINGS_COPY.themeDark },
  ];

  return (
    <div role="radiogroup" aria-label={SETTINGS_COPY.themeLabel} style={segTrackStyle}>
      {options.map((option) => {
        const active = mode === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setMode(option.id)}
            style={{
              ...segButtonStyle,
              background: active ? 'var(--color-surface)' : 'transparent',
              color: active ? 'var(--color-text)' : 'var(--color-secondary-strong)',
              boxShadow: active ? boxShadows.e1 : 'none',
              fontWeight: active ? 700 : 600,
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Closet privacy switch, seeded from the server so it lands without a flash.
 * Framed as "Private closet": ON = private. Optimistic PATCH to the existing
 * /api/profile/privacy contract, reverting the thumb if the write fails.
 */
function PrivacyControl({ initialIsPrivate }: { initialIsPrivate: boolean }) {
  const reduced = useReducedMotion();
  const [isPrivate, setIsPrivate] = useState(initialIsPrivate);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    const next = !isPrivate;
    setIsPrivate(next); // optimistic
    setBusy(true);
    try {
      const res = await fetch('/api/profile/privacy', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isPrivate: next }),
      });
      if (!res.ok) throw new Error('privacy patch failed');
    } catch {
      setIsPrivate(!next); // revert
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={rowStyle}>
      <span style={privacyTextStyle}>
        <span id="private-closet-label" style={rowLabelStyle}>
          {SETTINGS_COPY.privateClosetTitle}
        </span>
        <span style={rowHintStyle}>{SETTINGS_COPY.privateClosetHint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={isPrivate}
        aria-labelledby="private-closet-label"
        disabled={busy}
        onClick={toggle}
        style={{
          ...trackStyle,
          background: isPrivate ? 'var(--color-accent)' : 'var(--color-hairline)',
        }}
      >
        <motion.span
          aria-hidden="true"
          style={thumbStyle}
          animate={{ x: isPrivate ? spacing.s6 : 0 }}
          transition={transitionFor(motionToken.springs.snappy, reduced)}
        />
      </button>
    </div>
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
  gap: 'var(--space-3)',
};

const backStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  alignSelf: 'flex-start',
  minHeight: 'var(--touch-target-min)',
  color: 'var(--color-secondary-strong)',
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  fontWeight: 600,
  textDecoration: 'none',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.largeTitle.rem,
  lineHeight: `${typeRamp.largeTitle.lineHeight}px`,
  fontWeight: 700,
};

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const sectionHeadingStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--color-secondary-strong)',
};

const sectionBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  paddingTop: 'var(--space-3)',
  borderTop: '1px solid var(--color-hairline)',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-4)',
  minHeight: 'var(--touch-target-min)',
};

const rowLabelStyle: CSSProperties = {
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  fontWeight: 600,
  color: 'var(--color-text)',
};

const rowHintStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

// A tappable row that navigates (legal links) — label left, chevron right.
const navRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-4)',
  minHeight: 'var(--touch-target-min)',
  textDecoration: 'none',
};

// A tappable row that stacks a label over a hint (the mailto support row).
const linkRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  minHeight: 'var(--touch-target-min)',
  justifyContent: 'center',
  textDecoration: 'none',
};

const chevronStyle: CSSProperties = {
  color: 'var(--color-secondary-strong)',
  fontSize: typeRamp.body.rem,
};

const privacyTextStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
};

const signOutStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  alignSelf: 'flex-start',
  minHeight: 'var(--touch-target-web)',
  paddingInline: 'var(--space-4)',
  borderRadius: 'var(--radius-input)',
  border: '1px solid var(--color-hairline)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  fontWeight: 600,
  cursor: 'pointer',
};

// Segmented control: a hairline-tinted pill; the active segment lifts to surface.
const segTrackStyle: CSSProperties = {
  display: 'inline-flex',
  padding: 'var(--space-1)',
  gap: 'var(--space-1)',
  borderRadius: 'var(--radius-chip)',
  background: 'color-mix(in srgb, var(--color-hairline) 60%, transparent)',
};

const segButtonStyle: CSSProperties = {
  minHeight: 'var(--touch-target-min)',
  paddingInline: 'var(--space-3)',
  borderRadius: 'var(--radius-chip)',
  border: 'none',
  cursor: 'pointer',
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
};

// Track: 48×24 pill, 4px inset; thumb travels s6. Mirrors the closet toggle.
const trackStyle: CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  flexShrink: 0,
  width: 'var(--space-12)',
  height: 'var(--space-6)',
  padding: 'var(--space-1)',
  borderRadius: 'var(--radius-hero)',
  border: 'none',
  cursor: 'pointer',
};

const thumbStyle: CSSProperties = {
  width: 'var(--space-4)',
  height: 'var(--space-4)',
  borderRadius: '50%',
  background: 'var(--color-bg)',
};
