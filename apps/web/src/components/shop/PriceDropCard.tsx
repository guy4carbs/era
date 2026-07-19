'use client';

import { useState, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { layout, motion as motionToken } from '@era/tokens';
import { Text } from '../Text';
import { strings } from '@era/core/strings';
import { pressProps, transitionFor } from '../../lib/motion';
import { markRead, type PriceDropPayload } from '../../lib/notifications-client';

export interface PriceDropCardProps {
  /** The notification id — the key the read-mark and parent removal both use. */
  id: string;
  /** The price-drop details: the saved piece, the old→new price, the click-out. */
  payload: PriceDropPayload;
  /**
   * Called after the user acts (took a look OR dismissed). The parent drops the
   * row optimistically; the read-mark rides along in the background either way.
   */
  onResolve: (id: string) => void;
}

/** rel for the monetised click-out: no window handle, no ranking pass, disclosed. */
const AFFILIATE_REL = 'noopener nofollow sponsored';

/**
 * Belt-and-suspenders on top of Forge's server-side guard: only ever put a URL
 * into an href if it parses as `https:`. Anything else returns null, so a
 * tampered link can never become an executable/insecure href in the origin.
 * Mirrors {@link file://./ShopCard.tsx}'s guard.
 */
function safeHttpsUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Format an integer-cents amount in its own currency. Whole amounts stay quiet
 * (no ".00" noise, matching Shop's quiet-luxury pricing); a fractional drop keeps
 * its cents so the number is never wrong. Falls back to a plain `CUR 96` string
 * on an unknown currency code.
 */
function formatCents(cents: number, currency: string): string {
  const amount = cents / 100;
  const whole = Number.isInteger(amount);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${whole ? amount : amount.toFixed(2)}`;
  }
}

/**
 * A single in-app "price dropped" heads-up for a piece the user saved. Quiet by
 * design — a thumbnail, one honest line (old→new price, no urgency), a way in
 * ("Take a look"), and a way out ("Dismiss"). Both actions mark the notification
 * read: the click-out fires the read in the background so the anchor navigates
 * instantly, and dismiss resolves optimistically. Copy is Quill's
 * {@link strings.shop.priceAlerts.card}; every dimension/colour is a token.
 */
export function PriceDropCard({ id, payload, onResolve }: PriceDropCardProps) {
  const reduced = useReducedMotion();
  const href = safeHttpsUrl(payload.affiliateUrl);
  // A broken thumbnail degrades to a neutral tile, never raw alt text under the
  // affiliate anchor (which would style as a blue underlined link).
  const [imgFailed, setImgFailed] = useState(false);
  const alt = payload.title;
  const oldPrice = formatCents(payload.oldPriceCents, payload.currency);
  const newPrice = formatCents(payload.newPriceCents, payload.currency);
  const copy = strings.shop.priceAlerts.card;

  /** Both actions retire the row and mark it read; the read never blocks the UI. */
  function resolve() {
    void markRead(id).catch(() => {
      /* swallow — a failed read-mark must never surface; the row is gone locally */
    });
    onResolve(id);
  }

  const thumb = imgFailed ? (
    <div style={thumbPlaceholderStyle} aria-label={alt} role="img" />
  ) : (
    <img
      src={payload.imageUrl}
      alt={alt}
      style={thumbImageStyle}
      loading="lazy"
      onError={() => setImgFailed(true)}
    />
  );

  return (
    <motion.article
      style={cardStyle}
      initial={reduced ? undefined : { opacity: 0, y: 8 }}
      animate={reduced ? undefined : { opacity: 1, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, y: -8 }}
      transition={transitionFor(motionToken.springs.gentle, reduced)}
    >
      {href ? (
        <motion.a
          href={href}
          target="_blank"
          rel={AFFILIATE_REL}
          onClick={resolve}
          style={thumbLinkStyle}
          aria-label={copy.view}
          {...pressProps(reduced)}
        >
          {thumb}
        </motion.a>
      ) : (
        <div style={thumbLinkStyle}>{thumb}</div>
      )}

      <div style={bodyStyle}>
        <Text variant="caption" as="p" weight={600} style={{ margin: 0, letterSpacing: '0.02em', textTransform: 'uppercase', color: 'var(--color-secondary-strong)' }}>{copy.title}</Text>
        <Text variant="ui" as="p" size="subhead" weight={500} style={{ margin: 0, color: 'var(--color-text)' }}>{copy.body(payload.title, oldPrice, newPrice)}</Text>
        <div style={actionsStyle}>
          {href ? (
            <motion.a href={href} target="_blank" rel={AFFILIATE_REL} onClick={resolve} style={viewStyle} {...pressProps(reduced)}>
              <Text variant="ui" as="span" size="footnote" weight={600} style={{ color: 'var(--color-accent)', textDecoration: 'none' }}>{copy.view}</Text>
            </motion.a>
          ) : (
            <span />
          )}
          <motion.button type="button" onClick={resolve} style={dismissStyle} {...pressProps(reduced)}>
            <Text variant="ui" as="span" size="footnote" weight={500} style={{ color: 'var(--color-secondary-strong)' }}>{copy.dismiss}</Text>
          </motion.button>
        </div>
      </div>
    </motion.article>
  );
}

const cardStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-3)',
  padding: 'var(--space-3)',
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-e1)',
  isolation: 'isolate',
};

const thumbLinkStyle: CSSProperties = {
  display: 'block',
  flexShrink: 0,
  width: 'var(--space-16)',
  // Reserved 4:5 box from the item-card token so the thumbnail can't reflow the
  // notification row as it loads (D6 CLS).
  aspectRatio: layout.itemCard.aspectRatio,
  borderRadius: 'var(--radius-input)',
  overflow: 'hidden',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-hairline)',
  // Belt-and-suspenders: a bare alt string can never surface as a blue link.
  color: 'var(--color-secondary)',
  textDecoration: 'none',
};

const thumbImageStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
};

// Neutral fill for a broken/missing thumbnail — keeps the box, shows no alt text.
const thumbPlaceholderStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  background: 'var(--color-surface)',
};

const bodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  minWidth: 0,
  flex: 1,
};


const actionsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
  marginTop: 'var(--space-1)',
  minHeight: 'var(--touch-target-min)',
};

const viewStyle: CSSProperties = {
  textDecoration: 'none',
};

const dismissStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  padding: 0,
  cursor: 'pointer',
};
