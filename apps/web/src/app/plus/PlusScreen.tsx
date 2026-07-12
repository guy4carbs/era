'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { typeRamp, boxShadows } from '@era/tokens';
import { strings } from '@era/core/strings';
import { useTheme } from '../../lib/theme';
import { Button, Container } from '../../components';

/** A Stripe redirect can return `?status=success|canceled`; null when neither. */
type Status = 'success' | 'canceled' | null;

/** Which billing plan a checkout button drives. */
type Plan = 'monthly' | 'annual';

/** What's currently in flight — one action at a time, so buttons can co-disable. */
type Busy = Plan | 'portal' | null;

/**
 * One plan's Stripe-sourced display data. `amount` is a fully-formatted, localized
 * string ready to render (e.g. "$6.99") — formatting is the price source's job, not
 * this component's, so no currency math or hardcoded symbol lives here. `savings`,
 * when present, is the real, Stripe-derived saving line for the annual plan (also
 * pre-formatted); its presence is what substantiates the "Best value" badge.
 */
export interface PlanPrice {
  readonly amount: string;
  readonly savings?: string;
}

/**
 * The two plans' prices, sourced from Stripe at runtime and threaded in as data.
 * DELIBERATELY OPTIONAL: no price lives in copy, and no price source is wired yet
 * (checkout/portal return only a redirect `url`; a dedicated price feed is the
 * follow-up). Until one lands, this is omitted and the cards render honestly
 * price-free — plan name, cadence, and the value proposition, no invented numbers.
 * When the price feed ships, pass this from the server component and amounts appear
 * with no other change here.
 */
export interface PlusPrices {
  readonly monthly?: PlanPrice;
  readonly annual?: PlanPrice;
}

export interface PlusScreenProps {
  /** Server truth: is this account already on Era+? Chooses which face renders. */
  isPlus: boolean;
  /** The Stripe redirect status, if we arrived back from checkout. */
  status: Status;
  /** Stripe-sourced display prices, or undefined until the price feed is wired. */
  prices?: PlusPrices;
}

const copy = strings.plus;

/**
 * The Era+ surface, client half. Renders one of two faces from the server-decided
 * `isPlus`: the calm "you're in" management state for a subscriber, or the plan
 * cards for everyone else. Both faces are token-driven, so they render correctly
 * in light and dark with no per-mode branching here. All motion lives in the
 * shared {@link Button}; nothing on this screen pulses, counts down, or nags.
 */
export function PlusScreen({ isPlus, status, prices }: PlusScreenProps) {
  const [busy, setBusy] = useState<Busy>(null);
  const [errored, setErrored] = useState(false);

  /**
   * POST to a billing route that answers `{ url }`, then hand the browser to that
   * URL (Stripe checkout or portal). Any non-OK response or missing URL surfaces
   * the calm error line and re-enables the buttons — no redirect, no alarm.
   */
  async function go(action: Busy, endpoint: string, body?: Record<string, unknown>) {
    if (busy) return;
    setErrored(false);
    setBusy(action);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(`${endpoint} → ${res.status}`);
      const data = (await res.json()) as { url?: unknown };
      if (typeof data.url !== 'string' || data.url.length === 0) {
        throw new Error(`${endpoint} returned no url`);
      }
      // Leave `busy` set — we're navigating away; the button stays in its
      // reassuring in-flight state right up until the page unloads.
      window.location.assign(data.url);
    } catch {
      setErrored(true);
      setBusy(null);
    }
  }

  const checkout = (plan: Plan) => void go(plan, '/api/plus/checkout', { plan });
  const portal = () => void go('portal', '/api/plus/portal');

  return (
    <Container>
      <main style={screenStyle}>
        <header style={headerStyle}>
          <Link href="/settings" aria-label={`Back to ${copy.back}`} style={backStyle}>
            <span aria-hidden="true">←</span>
            {copy.back}
          </Link>
          <h1 style={titleStyle}>{copy.paywallTitle}</h1>
          <p style={subtitleStyle}>{isPlus ? copy.alreadyPlus : copy.paywallSubtitle}</p>
        </header>

        {isPlus ? (
          <ManageState busy={busy} errored={errored} onPortal={portal} />
        ) : (
          <Paywall
            status={status}
            prices={prices}
            busy={busy}
            errored={errored}
            onCheckout={checkout}
            onPortal={portal}
          />
        )}
      </main>
    </Container>
  );
}

/** The subscribed face: warm thanks, then a single quiet "manage plan" action. */
function ManageState({
  busy,
  errored,
  onPortal,
}: {
  busy: Busy;
  errored: boolean;
  onPortal: () => void;
}) {
  return (
    <section style={sectionStyle} aria-labelledby="plus-manage-heading">
      <p style={bodyStyle}>{copy.alreadyPlusBody}</p>

      <div style={manageBlockStyle}>
        <h2 id="plus-manage-heading" style={sectionHeadingStyle}>
          {copy.managePlan}
        </h2>
        <Button
          variant="secondary"
          onClick={onPortal}
          disabled={busy !== null}
          aria-busy={busy === 'portal'}
          style={selfStartStyle}
        >
          {busy === 'portal' ? copy.checkoutBusy : copy.portalCta}
        </Button>
        <ErrorLine show={errored} />
        <p style={reassureStyle}>{copy.cancelAnytime}</p>
      </div>
    </section>
  );
}

/** The unsubscribed face: an optional return banner, the two plans, honest notes. */
function Paywall({
  status,
  prices,
  busy,
  errored,
  onCheckout,
  onPortal,
}: {
  status: Status;
  prices?: PlusPrices;
  busy: Busy;
  errored: boolean;
  onCheckout: (plan: Plan) => void;
  onPortal: () => void;
}) {
  return (
    <section style={sectionStyle}>
      {status ? <StatusBanner status={status} /> : null}

      <div style={plansStyle}>
        <PlanCard
          name={copy.annualLabel}
          cadence={copy.annualCadence}
          price={prices?.annual?.amount}
          note={prices?.annual?.savings}
          // The best-value badge only appears once a real, Stripe-sourced saving
          // substantiates it — never as an unbacked claim on a price-free card.
          badge={prices?.annual?.savings ? copy.bestValue : undefined}
          primary
          busy={busy === 'annual'}
          disabled={busy !== null}
          onSelect={() => onCheckout('annual')}
        />
        <PlanCard
          name={copy.monthlyLabel}
          cadence={copy.monthlyCadence}
          price={prices?.monthly?.amount}
          busy={busy === 'monthly'}
          disabled={busy !== null}
          onSelect={() => onCheckout('monthly')}
        />
      </div>

      <ErrorLine show={errored} />

      <p style={honestNoteStyle}>{copy.honestAnnualNote}</p>
      {/* Price-free cards must say so — a blind "Continue" would flunk the
          honesty bar. Rendered only when no Stripe-sourced amounts arrived. */}
      {!prices?.monthly && !prices?.annual ? (
        <p style={honestNoteStyle}>{copy.pricePendingNote}</p>
      ) : null}
      <p style={reassureStyle}>{copy.cancelAnytime}</p>

      <button
        type="button"
        onClick={onPortal}
        disabled={busy !== null}
        style={restoreLinkStyle}
      >
        {copy.restorePurchases}
      </button>
    </section>
  );
}

/**
 * One plan card. `primary` (the annual plan) lifts to a warmer surface with an
 * accent hairline — visually first, but the honesty lives in the copy, never in
 * urgency. `price`/`note`/`badge` are Stripe-sourced and OPTIONAL: with no price
 * feed wired yet they're absent, and the card renders honestly price-free (name +
 * cadence + CTA) rather than inventing a number. The CTA is the shared spring
 * Button: accent fill for the primary plan, quiet surface for the secondary.
 */
function PlanCard({
  name,
  price,
  cadence,
  note,
  badge,
  primary = false,
  busy,
  disabled,
  onSelect,
}: {
  name: string;
  /** Stripe-sourced, pre-formatted amount (e.g. "$6.99"); undefined until wired. */
  price?: string;
  cadence: string;
  note?: string;
  badge?: string;
  primary?: boolean;
  busy: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const { resolved } = useTheme();
  // The primary card sits a touch above the page on an accent-tinted surface; the
  // tint stays faint (glow, not colour) and reads in both themes via color-mix.
  const cardStyle: CSSProperties = {
    ...planCardBaseStyle,
    boxShadow: primary ? boxShadows.e2 : boxShadows.e1,
    border: primary
      ? '1px solid color-mix(in srgb, var(--color-accent) 45%, var(--color-hairline))'
      : '1px solid var(--color-hairline)',
    background: primary
      ? `color-mix(in srgb, var(--color-accent) ${resolved === 'dark' ? 10 : 6}%, var(--color-surface))`
      : 'var(--color-surface)',
  };

  return (
    <div style={cardStyle}>
      <div style={planTopStyle}>
        <span style={planNameStyle}>{name}</span>
        {badge ? <span style={badgeStyle}>{badge}</span> : null}
      </div>
      <div style={priceRowStyle}>
        {price ? <span style={priceStyle}>{price}</span> : null}
        <span style={cadenceStyle}>{cadence}</span>
      </div>
      {note ? <p style={planNoteStyle}>{note}</p> : null}
      <Button
        variant={primary ? 'primary' : 'secondary'}
        onClick={onSelect}
        disabled={disabled}
        aria-busy={busy}
        aria-label={`${copy.checkoutCta} — ${name}`}
        style={ctaStyle}
      >
        {busy ? copy.checkoutBusy : copy.checkoutCta}
      </Button>
    </div>
  );
}

/** The calm return-from-Stripe banner. Success or a no-guilt cancel — never red. */
function StatusBanner({ status }: { status: NonNullable<Status> }) {
  const text = status === 'success' ? copy.justSubscribed : copy.checkoutCanceled;
  return (
    <p role="status" style={bannerStyle}>
      {text}
    </p>
  );
}

/**
 * The one error line for the whole surface — a quiet, retry-inviting sentence in
 * body ink, not an alarm panel. Always mounted as a live region so assistive tech
 * announces it the moment it appears; empty (and zero-height-neutral) until then.
 */
function ErrorLine({ show }: { show: boolean }): ReactNode {
  return (
    <p role="alert" aria-live="polite" style={errorLineStyle}>
      {show ? copy.checkoutError : ''}
    </p>
  );
}

// --- layout ---------------------------------------------------------------

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

const subtitleStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
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

const bodyStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-text)',
};

// --- plans ----------------------------------------------------------------

const plansStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

const planCardBaseStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  padding: 'var(--space-5)',
  borderRadius: 'var(--radius-card)',
};

const planTopStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
};

const planNameStyle: CSSProperties = {
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  fontWeight: 700,
  color: 'var(--color-text)',
};

// Quiet, factual best-value marker: accent ink on a faint accent wash, no shout.
const badgeStyle: CSSProperties = {
  paddingInline: 'var(--space-2)',
  paddingBlock: 'var(--space-1)',
  borderRadius: 'var(--radius-chip)',
  background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
  color: 'var(--color-accent)',
  fontSize: typeRamp.caption.rem,
  lineHeight: `${typeRamp.caption.lineHeight}px`,
  fontWeight: 700,
  letterSpacing: '0.02em',
};

const priceRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 'var(--space-2)',
};

const priceStyle: CSSProperties = {
  fontSize: typeRamp.title2.rem,
  lineHeight: `${typeRamp.title2.lineHeight}px`,
  fontWeight: 700,
  color: 'var(--color-text)',
};

const cadenceStyle: CSSProperties = {
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

const planNoteStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

const ctaStyle: CSSProperties = {
  width: '100%',
  marginTop: 'var(--space-1)',
};

// --- notes, banner, error, links ------------------------------------------

const honestNoteStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

const reassureStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-secondary)',
};

// Return-from-Stripe note: a soft accent-tinted surface, calm in both themes.
const bannerStyle: CSSProperties = {
  margin: 0,
  padding: 'var(--space-3) var(--space-4)',
  borderRadius: 'var(--radius-input)',
  background: 'color-mix(in srgb, var(--color-accent) 8%, var(--color-surface))',
  border: '1px solid color-mix(in srgb, var(--color-accent) 30%, var(--color-hairline))',
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  color: 'var(--color-text)',
};

// Deliberately NOT rust/red — a quiet body-ink line that invites a retry.
const errorLineStyle: CSSProperties = {
  margin: 0,
  minHeight: `${typeRamp.footnote.lineHeight}px`,
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  fontWeight: 600,
  color: 'var(--color-text)',
};

const manageBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const selfStartStyle: CSSProperties = {
  alignSelf: 'flex-start',
};

// Quiet tertiary link — accent text, no chrome; the low-key "manage elsewhere" path.
const restoreLinkStyle: CSSProperties = {
  alignSelf: 'flex-start',
  padding: 0,
  minHeight: 'var(--touch-target-min)',
  border: 'none',
  background: 'transparent',
  color: 'var(--color-accent)',
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  fontWeight: 600,
  cursor: 'pointer',
  textAlign: 'left',
};
