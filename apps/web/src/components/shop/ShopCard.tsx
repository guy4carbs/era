'use client';

import { useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { motion as motionToken, layout } from '@era/tokens';
import { Text } from '../Text';
import { strings } from '@era/core/strings';
import type { ProductWhy, RankedProduct, WhyDetail } from '@era/core/shop';
import { pressProps, transitionFor } from '../../lib/motion';
import { logRecEvent, type SavedShopProduct } from '../../lib/shop-client';
import { WhyLabel } from './WhyLabel';
import { WhyDetailSheet } from './WhyDetailSheet';

export interface ShopCardProps {
  /**
   * A ranked pick (grid) or a wishlisted pick (Saved view). A {@link SavedShopProduct}
   * carries no ranking, so its `why`/`whyDetail` are simply absent — the card reads
   * both off the product with an `in` check and renders the why affordances only
   * when they exist.
   */
  product: RankedProduct | SavedShopProduct;
  /** Whether this pick is currently on the wishlist — drives the heart's filled state. */
  isSaved: boolean;
  /** Toggle the wishlist state for this pick (the parent owns the optimistic update). */
  onToggleSave: () => void;
  /**
   * Remove this card after the user says it's not for them. Absent on Saved-view
   * cards (a saved pick is removed via the heart, not dismissed), which also hides
   * the "Not for me" action.
   */
  onDismiss?: (productId: string) => void;
}

/** rel for every monetised click-out: no window handle, no ranking pass, disclosed. */
const AFFILIATE_REL = 'noopener nofollow sponsored';

/**
 * Belt-and-suspenders on top of Forge's server-side guard: only ever put a URL
 * into an href if it parses as `https:`. Anything else — `javascript:`, `http:`,
 * `data:`, garbage — returns null, so a tampered link can never become an
 * executable/insecure href in the era.style origin. Non-https → non-clickable card.
 */
function safeHttpsUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Format a price in its own currency, whole dollars (quiet, no cents noise). */
function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${currency} ${Math.round(price)}`;
  }
}

/**
 * One ranked pick as a quiet-luxury card: image over brand / title / price, the
 * honest {@link WhyLabel}, and two actions. The image and the "View at" link are
 * both monetised click-outs — each opens `affiliateUrl` in a NEW tab
 * (`rel="noopener nofollow sponsored"`) and fires a fire-and-forget `rec_click`.
 * "Not for me" fires `rec_dismiss` and removes the card. Neither log blocks the
 * user: the anchor navigates immediately and {@link logRecEvent} never awaits.
 */
export function ShopCard({ product, isSaved, onToggleSave, onDismiss }: ShopCardProps) {
  const reduced = useReducedMotion();
  const [whyOpen, setWhyOpen] = useState(false);
  // When the product image URL can't load, we swap in a neutral placeholder tile
  // rather than letting the browser fall back to raw `alt` text (which, inside the
  // affiliate anchor, would render as a blue underlined link).
  const [imgFailed, setImgFailed] = useState(false);
  const alt = `${product.brand} ${product.title}`;
  // Only a validated https link is ever rendered as a click-out. A tampered or
  // non-https URL leaves the card non-clickable rather than exposing a bad href.
  const href = safeHttpsUrl(product.affiliateUrl);

  // A saved pick carries no ranking, so `why`/`whyDetail` are absent — read them
  // off the product only when present. The compact label is tappable exactly when
  // there is rich detail to reveal.
  const why: ProductWhy | null = 'why' in product ? product.why : null;
  const whyDetail: WhyDetail | null = 'whyDetail' in product ? product.whyDetail : null;

  function fireClick() {
    logRecEvent({
      kind: 'rec_click',
      productId: product.id,
      retailer: product.retailer,
      why: why?.kind,
    });
  }

  function handleDismiss() {
    logRecEvent({
      kind: 'rec_dismiss',
      productId: product.id,
      retailer: product.retailer,
      why: why?.kind,
    });
    onDismiss?.(product.id);
  }

  const image = imgFailed ? (
    // Broken/missing image → a neutral surface tile carrying the brand initial,
    // never raw alt text under an anchor (which would style as a blue link).
    <div style={imagePlaceholderStyle} aria-label={alt} role="img">
      <Text variant="oviAccent" as="span" size="largeTitle" style={{ color: 'var(--color-secondary)' }} aria-hidden="true">
        {product.brand.charAt(0).toUpperCase()}
      </Text>
    </div>
  ) : (
    // Product photos read better filled than contained; the surface shows
    // through as a graceful placeholder if the image can't load.
    <img
      src={product.imageUrl}
      alt={alt}
      style={imageStyle}
      loading="lazy"
      onError={() => setImgFailed(true)}
    />
  );

  return (
    <motion.article
      style={cardStyle}
      whileHover={reduced ? undefined : { y: layout.hover.liftPx, boxShadow: 'var(--shadow-e3)' }}
      transition={transitionFor(motionToken.springs.gentle, reduced)}
    >
      {href ? (
        <motion.a
          href={href}
          target="_blank"
          rel={AFFILIATE_REL}
          onClick={fireClick}
          style={imageLinkStyle}
          aria-label={strings.shop.viewAt(product.retailer)}
          {...pressProps(reduced)}
        >
          {image}
        </motion.a>
      ) : (
        <div style={imageLinkStyle}>{image}</div>
      )}

      <div style={bodyStyle}>
        <Text variant="ui" as="p" size="caption" weight={600} style={{ margin: 0, letterSpacing: '0.02em', textTransform: 'uppercase', color: 'var(--color-secondary-strong)' }}>{product.brand}</Text>
        <Text variant="body" as="p" size="subhead" weight={600} style={{ margin: 0, color: 'var(--color-text)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{product.title}</Text>
        <p style={priceRowStyle}>
          <Text variant="ui" as="span" size="subhead" weight={700} style={{ color: 'var(--color-text)' }}>{formatPrice(product.price, product.currency)}</Text>
          <Text variant="caption" as="span" style={{ color: 'var(--color-secondary-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.retailer}</Text>
        </p>

        {/* The compact why is tappable ONLY when there's rich detail to reveal;
            otherwise it stays the plain one-liner. The label itself is unchanged
            — the button is a transparent, full-width wrapper so a keyboard user
            gets the reveal for free. */}
        {why && whyDetail ? (
          <motion.button
            type="button"
            style={whyTriggerStyle}
            aria-haspopup="dialog"
            aria-expanded={whyOpen}
            aria-label={strings.shop.whyDetail.title}
            onClick={() => setWhyOpen(true)}
            {...pressProps(reduced)}
          >
            <WhyLabel why={why} />
          </motion.button>
        ) : (
          <WhyLabel why={why} />
        )}

        <div style={actionsStyle}>
          {href ? (
            <motion.a href={href} target="_blank" rel={AFFILIATE_REL} onClick={fireClick} style={viewAtStyle} {...pressProps(reduced)}>
              <Text variant="ui" as="span" size="footnote" weight={600} style={{ color: 'var(--color-accent)', textDecoration: 'none' }}>{strings.shop.viewAt(product.retailer)}</Text>
            </motion.a>
          ) : (
            <span />
          )}
          <div style={actionsRightStyle}>
            <motion.button
              type="button"
              onClick={onToggleSave}
              style={{ ...saveStyle, color: isSaved ? 'var(--color-accent)' : 'var(--color-secondary-strong)' }}
              aria-pressed={isSaved}
              aria-label={isSaved ? strings.shop.saved.removeA11y : strings.shop.saved.saveA11y}
              whileTap={reduced ? undefined : { scale: motionToken.press.scale }}
              transition={transitionFor(motionToken.springs.gentle, reduced)}
            >
              <Text variant="ui" as="span" size="subhead" style={{ lineHeight: '1' }} aria-hidden="true">
                {isSaved ? '♥' : '♡'}
              </Text>
              <Text variant="ui" as="span" size="footnote" weight={600}>{isSaved ? strings.shop.saved.savedState : strings.shop.saved.save}</Text>
            </motion.button>
            {onDismiss ? (
              <motion.button type="button" onClick={handleDismiss} style={dismissStyle} {...pressProps(reduced)}>
                <Text variant="ui" as="span" size="footnote" weight={500} style={{ color: 'var(--color-secondary-strong)' }}>{strings.shop.dismiss}</Text>
              </motion.button>
            ) : null}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {whyOpen && whyDetail ? (
          <WhyDetailSheet whyDetail={whyDetail} onClose={() => setWhyOpen(false)} />
        ) : null}
      </AnimatePresence>
    </motion.article>
  );
}

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-e1)',
  overflow: 'hidden',
  isolation: 'isolate',
};

const imageLinkStyle: CSSProperties = {
  display: 'block',
  // Reserve the 4:5 image box from the item-card token before the (lazy) product
  // photo loads (D6 CLS): the grid never reflows as photos stream in.
  aspectRatio: layout.itemCard.aspectRatio,
  background: 'var(--color-surface)',
  borderBottom: '1px solid var(--color-hairline)',
  // Belt-and-suspenders: even if a bare alt string ever surfaced here, it can
  // never render as the default blue underlined link.
  color: 'var(--color-secondary)',
  textDecoration: 'none',
};

// Neutral fallback tile for a broken/missing product image — fills the same box
// as the photo, brand initial centred, so the card never collapses to alt text.
const imagePlaceholderStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--color-surface)',
};

const imageStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
};

const bodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  padding: 'var(--space-3)',
};


const priceRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
  margin: 0,
  marginTop: 'var(--space-1)',
};


// Full-width transparent wrapper so the compact why label keeps its own layout
// while gaining button semantics (focus, Enter/Space) for the detail reveal.
const whyTriggerStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  border: 'none',
  background: 'transparent',
  padding: 0,
  margin: 0,
  textAlign: 'left',
  cursor: 'pointer',
};

const actionsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
  marginTop: 'var(--space-2)',
  minHeight: 'var(--touch-target-min)',
};

const actionsRightStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
};

const saveStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  border: 'none',
  background: 'transparent',
  padding: 0,
  cursor: 'pointer',
};

const viewAtStyle: CSSProperties = {
  textDecoration: 'none',
};

const dismissStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  padding: 0,
  cursor: 'pointer',
};
