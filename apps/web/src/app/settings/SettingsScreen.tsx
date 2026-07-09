'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken, boxShadows, spacing, typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { transitionFor } from '../../lib/motion';
import { useTheme, type ThemeMode } from '../../lib/theme';
import { eraAuth } from '../../lib/auth-client';
import {
  getPreferences,
  updatePreferences,
  type NotificationPreferences,
} from '../../lib/notifications-client';
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

        <Section title={strings.settings.priceAlerts.title}>
          <PriceAlertsControl />
        </Section>

        <Section title={strings.settings.receiptAddress.title}>
          <ReceiptAddressControl />
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

/**
 * A single labelled switch used across the price-alerts group: the master toggle
 * and the two channel rows. `off`/`on` are driven by the parent; a disabled
 * switch (channels while the master is off) greys out and stops accepting taps
 * but keeps its `switch` role and `aria-checked` for assistive tech.
 */
function AlertSwitch({
  label,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const reduced = useReducedMotion();
  const labelId = `alert-switch-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div style={{ ...rowStyle, opacity: disabled ? 0.5 : 1 }}>
      <span id={labelId} style={rowLabelStyle}>
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={onToggle}
        style={{
          ...trackStyle,
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: checked ? 'var(--color-accent)' : 'var(--color-hairline)',
        }}
      >
        <motion.span
          aria-hidden="true"
          style={thumbStyle}
          animate={{ x: checked ? spacing.s6 : 0 }}
          transition={transitionFor(motionToken.springs.snappy, reduced)}
        />
      </button>
    </div>
  );
}

/**
 * Price-drop alerts — opt-IN, off until the user turns it on. A master toggle
 * gates two channel switches (email, push) that grey out until it's on. Every
 * flip is optimistic against the `/api/notifications/preferences` contract and
 * reverts on a failed write. Preferences are fetched on mount; until they land
 * (or if the fetch fails) the switches stay disabled so nothing flips a value we
 * haven't confirmed. Copy is Quill's {@link strings.settings.priceAlerts}.
 */
function PriceAlertsControl() {
  const copy = strings.settings.priceAlerts;
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const loaded = await getPreferences();
        if (active) setPrefs(loaded);
      } catch {
        // Leave the switches disabled — we won't flip a value we can't read.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function patch(field: keyof NotificationPreferences, next: boolean) {
    if (!prefs || busy) return;
    const previous = prefs;
    setPrefs({ ...prefs, [field]: next }); // optimistic
    setBusy(true);
    try {
      const saved = await updatePreferences({ [field]: next });
      setPrefs(saved); // reconcile against the server's echoed truth
    } catch {
      setPrefs(previous); // revert
    } finally {
      setBusy(false);
    }
  }

  const ready = prefs !== null;
  const masterOn = prefs?.priceAlertsEnabled ?? false;

  return (
    <div style={alertsGroupStyle}>
      <p style={rowHintStyle}>{copy.explain}</p>

      <AlertSwitch
        label={copy.toggle}
        checked={masterOn}
        disabled={!ready || busy}
        onToggle={() => void patch('priceAlertsEnabled', !masterOn)}
      />

      <div style={channelsStyle}>
        <AlertSwitch
          label={copy.channelEmail}
          checked={prefs?.emailAlerts ?? false}
          disabled={!ready || !masterOn || busy}
          onToggle={() => void patch('emailAlerts', !(prefs?.emailAlerts ?? false))}
        />
        <AlertSwitch
          label={copy.channelPush}
          checked={prefs?.pushAlerts ?? false}
          disabled={!ready || !masterOn || busy}
          onToggle={() => void patch('pushAlerts', !(prefs?.pushAlerts ?? false))}
        />
      </div>

      <p style={rowHintStyle}>{copy.savedOnlyNote}</p>
    </div>
  );
}

/** The resolved server state of the personal receipt-forwarding address. */
type ReceiptAddressState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'dormant' }
  | { readonly status: 'active'; readonly address: string };

/** Progress of the regenerate (rotate) action, driving its confirmation/error line. */
type RegenerateStatus = 'idle' | 'busy' | 'done' | 'error';

/**
 * The personal receipt-forwarding address — the async transport upgrade of the
 * paste-based receipt import. Mirrors {@link PriceAlertsControl}: an explainer,
 * then the feature body. Dormant server-side (inbound receipts not provisioned) →
 * just the quiet "coming soon" line, no address UI. Active → the private address
 * in a selectable monospace row with a Copy button, a privacy footnote, and a
 * destructive-adjacent Regenerate action whose hard-kill consequence is shown
 * inline *before* the tap (no modal — restraint). Copy is Quill's
 * {@link strings.settings.receiptAddress}; the failure lines reuse the settings
 * error idiom. Fetch failure resolves to a quiet retry.
 */
function ReceiptAddressControl() {
  const copy = strings.settings.receiptAddress;
  const [state, setState] = useState<ReceiptAddressState>({ status: 'loading' });
  const [copied, setCopied] = useState(false);
  const [regen, setRegen] = useState<RegenerateStatus>('idle');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const res = await fetch('/api/settings/receipt-address', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`receipt-address failed: ${res.status}`);
      const body = (await res.json()) as { address: string | null; dormant: boolean };
      if (!mounted.current) return;
      setState(
        body.dormant || body.address === null
          ? { status: 'dormant' }
          : { status: 'active', address: body.address },
      );
      setRegen('idle');
    } catch {
      if (mounted.current) setState({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The copy confirmation is transient — it clears itself a beat after it shows.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => {
      if (mounted.current) setCopied(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleCopy(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      if (mounted.current) setCopied(true);
    } catch {
      // Clipboard blocked — the address row is selectable, so no error is surfaced.
    }
  }

  async function handleRegenerate() {
    setRegen('busy');
    try {
      const res = await fetch('/api/settings/receipt-address/regenerate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(`regenerate failed: ${res.status}`);
      const body = (await res.json()) as { address: string | null; dormant: boolean };
      if (!mounted.current) return;
      if (body.dormant || body.address === null) {
        setState({ status: 'dormant' });
        setRegen('idle');
        return;
      }
      setCopied(false);
      setState({ status: 'active', address: body.address });
      setRegen('done');
    } catch {
      if (mounted.current) setRegen('error');
    }
  }

  return (
    <div style={alertsGroupStyle}>
      <p style={rowHintStyle}>{copy.explain}</p>

      {state.status === 'error' && (
        <div style={receiptErrorRowStyle}>
          <p role="status" style={receiptErrorTextStyle}>
            {SETTINGS_COPY.genericError}
          </p>
          <button type="button" style={receiptRetryStyle} onClick={() => void load()}>
            {SETTINGS_COPY.retry}
          </button>
        </div>
      )}

      {state.status === 'dormant' && <p style={rowHintStyle}>{copy.dormant}</p>}

      {state.status === 'active' && (
        <>
          <div style={addressBlockStyle}>
            <span style={rowHintStyle}>{copy.addressLabel}</span>
            <div style={addressRowStyle}>
              <code style={addressCodeStyle}>{state.address}</code>
              <button
                type="button"
                style={copyButtonStyle}
                onClick={() => void handleCopy(state.address)}
              >
                {copy.copyCta}
              </button>
            </div>
            <p aria-live="polite" style={receiptConfirmStyle}>
              {copied ? copy.copied : ''}
            </p>
          </div>

          <p style={rowHintStyle}>{copy.privacyNote}</p>

          <div style={regenerateBlockStyle}>
            <p style={rowHintStyle}>{copy.regenerateConsequence}</p>
            <button
              type="button"
              style={{
                ...regenerateButtonStyle,
                opacity: regen === 'busy' ? 0.5 : 1,
                cursor: regen === 'busy' ? 'not-allowed' : 'pointer',
              }}
              disabled={regen === 'busy'}
              onClick={() => void handleRegenerate()}
            >
              {copy.regenerateCta}
            </button>
            <p
              aria-live="polite"
              style={regen === 'error' ? receiptErrorTextStyle : receiptConfirmStyle}
            >
              {regen === 'done'
                ? copy.regenerated
                : regen === 'error'
                  ? SETTINGS_COPY.genericError
                  : ''}
            </p>
          </div>
        </>
      )}
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

// The price-alerts group stacks its explain line, the master toggle, the indented
// channel rows, and the saved-only note.
const alertsGroupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

// Channel rows sit slightly inset from the master toggle to read as its children.
const channelsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  paddingLeft: 'var(--space-3)',
  borderLeft: '1px solid var(--color-hairline)',
  marginLeft: 'var(--space-1)',
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

// --- receipt address ---

// The revealed address, its caption, and the copy confirmation stack together.
const addressBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

// Address left (grows, wraps), Copy button right (fixed).
const addressRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
};

// The address itself: monospace + select-all so a single tap grabs the whole token.
const addressCodeStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  wordBreak: 'break-all',
  userSelect: 'all',
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius-input)',
  border: '1px solid var(--color-hairline)',
  background: 'color-mix(in srgb, var(--color-hairline) 40%, transparent)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-text)',
};

// Secondary Copy button — mirrors the sign-out frame, sized to sit beside the row.
const copyButtonStyle: CSSProperties = {
  flexShrink: 0,
  minHeight: 'var(--touch-target-min)',
  paddingInline: 'var(--space-3)',
  borderRadius: 'var(--radius-input)',
  border: '1px solid var(--color-hairline)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  fontWeight: 600,
  cursor: 'pointer',
};

// Transient/quiet confirmation line (copied, regenerated) — an always-present
// live region so assistive tech announces it; empty until there's something to say.
const receiptConfirmStyle: CSSProperties = {
  margin: 0,
  minHeight: `${typeRamp.footnote.lineHeight}px`,
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

// The Regenerate group: the hard-kill consequence, the action, then its result line.
const regenerateBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  paddingTop: 'var(--space-2)',
};

// Destructive-adjacent secondary action: rust text on a quiet frame — not the full
// danger treatment of Delete, but clearly weightier than the copy button.
const regenerateButtonStyle: CSSProperties = {
  alignSelf: 'flex-start',
  minHeight: 'var(--touch-target-web)',
  paddingInline: 'var(--space-4)',
  borderRadius: 'var(--radius-input)',
  border: '1px solid color-mix(in srgb, var(--color-rust) 40%, var(--color-hairline))',
  background: 'var(--color-surface)',
  color: 'var(--color-rust)',
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  fontWeight: 600,
};

// Fetch-failure row: the reused error line, plus a quiet retry.
const receiptErrorRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  minHeight: 'var(--touch-target-min)',
};

const receiptErrorTextStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-rust)',
};

const receiptRetryStyle: CSSProperties = {
  flexShrink: 0,
  padding: 0,
  minHeight: 'var(--touch-target-min)',
  border: 'none',
  background: 'transparent',
  color: 'var(--color-accent)',
  fontSize: typeRamp.footnote.rem,
  fontWeight: 600,
  cursor: 'pointer',
};
