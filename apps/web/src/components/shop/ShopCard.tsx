'use client';

import { useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { motion as motionToken } from '@era/tokens';
import { Text } from '../Text';
import { strings } from '@era/core/strings';
import type { ProductWhy, RankedProduct, WhyDetail } from '@era/core/shop';
import { pressProps, transitionFor } from '../../lib/motion';
import { logRecEvent, type SavedShopProduct } from '../../lib/shop-client';
import { ItemSurface } from '../items/ItemSurface';
import { OviOrb } from '../ovi';
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
  /**
   * Open Ovi pre-seeded when the `completes_outfits` why is tapped — that reason,
   * like the ambient strips, opens the panel rather than the static detail sheet.
   * Absent on Saved-view cards (no ranking, no why), where the why never renders.
   */
  onWhyCompletesOpen?: () => void;
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
 * One ranked pick, rebuilt on the Item-Engine grammar: the product photo is the
 * hero OBJECT — an {@link ItemSurface} (4:5 cream card, hairline frame, dual-e3
 * depth, 135° sheen, 1% warm tone, hover lift), with the brand / title / price /
 * why / actions reading quietly beneath it. The surface and the "View at" link
 * are both monetised click-outs — tapping the object opens `affiliateUrl` in a
 * NEW tab (`rel="noopener nofollow sponsored"` on the anchor; the surface tap
 * uses `window.open` with the same `noopener`/`noreferrer` posture) and fires a
 * fire-and-forget `rec_click`. "Not for me" fires `rec_dismiss` and removes the
 * card. Neither log blocks the user: the anchor navigates immediately and
 * {@link logRecEvent} never awaits.
 */
export function ShopCard({ product, isSaved, onToggleSave, onDismiss, onWhyCompletesOpen }: ShopCardProps) {
  const reduced = useReducedMotion();
  const [whyOpen, setWhyOpen] = useState(false);
  // When the product image URL can't load, we swap in a neutral placeholder tile
  // (the brand initial on the surface) rather than letting a broken <img> show.
  const [imgFailed, setImgFailed] = useState(false);
  const alt = `${product.brand} ${product.title}`;
  // Only a validated https link is ever rendered as a click-out. A tampered or
  // non-https URL leaves the card non-clickable rather than exposing a bad href.
  const href = safeHttpsUrl(product.affiliateUrl);

  // A saved pick carries no ranking, so `why`/`whyDetail` are absent — read them
  // off the product only when present. The whisper is tappable to the detail
  // sheet exactly when there is rich detail to reveal.
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

  // The surface tap is the same monetised click-out as the "View at" anchor. It
  // renders as a button (ItemSurface owns the hero interaction), so we navigate
  // programmatically with the same no-window-handle / no-referrer posture the
  // anchor's `rel` enforces; a non-https product leaves the object inert.
  function openAffiliate() {
    if (!href) return;
    fireClick();
    window.open(href, '_blank', 'noopener,noreferrer');
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

  // The `completes_outfits` reason opens Ovi pre-seeded (its ambient-strip
  // gesture); every other kind taps to the rich detail sheet when detail exists.
  const whyCompletesTap =
    why?.kind === 'completes_outfits' && onWhyCompletesOpen ? onWhyCompletesOpen : undefined;
  const whyDetailTap = why && whyDetail && !whyCompletesTap ? () => setWhyOpen(true) : undefined;

  // The brand initial stands in when the product image is missing/broken — an
  // ItemSurface badge over an empty (null-src) surface, so the 4:5 box, hairline,
  // sheen and warm tone still read; never a raw broken <img>.
  const initialBadge =
    imgFailed ? (
      <span aria-hidden="true" style={initialBadgeStyle}>
        <Text variant="oviAccent" as="span" size="largeTitle" style={{ color: 'var(--color-secondary)' }}>
          {product.brand.charAt(0).toUpperCase()}
        </Text>
      </span>
    ) : undefined;

  return (
    <motion.article style={cardStyle}>
      {/* The product photo AS the Item-Engine object: 4:5 surface, hairline, dual
          e3, sheen, warm tone, hover lift. `press` (not full tilt) — restraint on
          a product grid. Tapping it is the affiliate click-out. When there's no
          valid https link the surface goes inert (`none`). An off-DOM <img> probe
          detects a broken URL so we can fall the surface back to the brand initial
          without ever mounting a visibly-broken image. */}
      {!imgFailed && product.imageUrl ? (
        <img
          src={product.imageUrl}
          alt=""
          aria-hidden="true"
          style={probeStyle}
          onError={() => setImgFailed(true)}
        />
      ) : null}
      <ItemSurface
        src={imgFailed ? null : product.imageUrl}
        alt={href ? strings.shop.viewAt(product.retailer) : alt}
        interactive={href ? 'press' : 'none'}
        onPress={href ? openAffiliate : undefined}
        badge={initialBadge}
        imgStyle={productImgStyle}
      />

      <div style={bodyStyle}>
        <Text variant="ui" as="p" size="caption" weight={600} style={{ margin: 0, letterSpacing: '0.02em', textTransform: 'uppercase', color: 'var(--color-secondary-strong)' }}>{product.brand}</Text>
        <Text variant="body" as="p" size="subhead" weight={600} style={{ margin: 0, color: 'var(--color-text)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{product.title}</Text>
        <p style={priceRowStyle}>
          <Text variant="ui" as="span" size="subhead" weight={700} style={{ color: 'var(--color-text)' }}>{formatPrice(product.price, product.currency)}</Text>
          <Text variant="caption" as="span" style={{ color: 'var(--color-secondary-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.retailer}</Text>
        </p>

        {/* The why, as Ovi's whisper — one quiet voice for every kind. The 20px
            whisper orb (idle, decorative) beside the reason in Fraunces-Italic
            (oviAccent). `completes_outfits` opens Ovi pre-seeded; the others tap to
            the detail sheet when there's detail; `similar_owned` keeps its honest
            caution marker but in the same whisper register (never a positive pitch).
            No why → nothing renders. */}
        <WhyWhisper why={why} reduced={reduced} onCompletesOpen={whyCompletesTap} onDetailOpen={whyDetailTap} />

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

/**
 * The "why" as Ovi's whisper — one grammar for every reason kind. The 20px
 * whisper orb (idle, decorative) sits beside the honest line in Fraunces-Italic
 * (`oviAccent`), generalising the `completes_outfits` strip treatment to the
 * whole taxonomy: one quiet voice, not a per-kind label set.
 *
 *   - `completes_outfits` → taps to open Ovi pre-seeded (its ambient gesture).
 *   - `fills_gap`         → taps to the detail sheet when rich detail exists.
 *   - `similar_owned`     → the honest WARNING, kept in the whisper register: a
 *                           rust caution marker + faint rust wash carry the
 *                           caution (never coloring the line rust, which fails AA
 *                           on dark), while the line stays high-contrast text.
 *
 * When there's a tap target the whole whisper is one button; otherwise it's an
 * inert line. No `why` → nothing renders (we never fabricate a reason).
 */
function WhyWhisper({
  why,
  reduced,
  onCompletesOpen,
  onDetailOpen,
}: {
  why: ProductWhy | null;
  reduced: boolean | null;
  onCompletesOpen?: () => void;
  onDetailOpen?: () => void;
}) {
  if (why === null) {
    return null;
  }

  const warning = why.kind === 'similar_owned';
  const line =
    why.kind === 'completes_outfits'
      ? strings.shop.whyCompletesOutfits(why.count)
      : why.kind === 'fills_gap'
        ? strings.shop.whyFillsGap(strings.closet.categoryLabel(why.category).toLowerCase())
        : strings.shop.whySimilarOwned(why.ownedCount);

  const inner = (
    <>
      <OviOrb size={{ cssVar: 'var(--orb-whisper)' }} state="idle" />
      <Text
        variant="oviAccent"
        as="span"
        size="body"
        style={{
          margin: 0,
          minWidth: 0,
          color: 'var(--color-text)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {line}
      </Text>
    </>
  );

  const onTap = onCompletesOpen ?? onDetailOpen;
  const wrapStyle = warning ? { ...whisperStyle, ...whisperWarningStyle } : whisperStyle;
  const ariaLabel = onCompletesOpen
    ? line
    : onDetailOpen
      ? strings.shop.whyDetail.title
      : undefined;

  if (onTap) {
    return (
      <motion.button
        type="button"
        style={wrapStyle}
        aria-haspopup={onDetailOpen ? 'dialog' : undefined}
        aria-label={ariaLabel}
        onClick={onTap}
        whileTap={reduced ? undefined : { scale: motionToken.press.scale }}
        transition={transitionFor(motionToken.springs.snappy, reduced)}
      >
        {inner}
      </motion.button>
    );
  }

  return <div style={wrapStyle}>{inner}</div>;
}

// The whisper row: the orb + Ovi's italic line, one quiet unit. As a button it
// resets chrome so only the orb + line read; the hitbox is the whole row.
const whisperStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  width: '100%',
  minWidth: 0,
  border: 'none',
  background: 'transparent',
  padding: 0,
  margin: 0,
  textAlign: 'left',
  cursor: 'pointer',
};

// `similar_owned` is an honest warning — the caution is carried by a rust left-
// border + faint rust wash (matching WhyLabel), never by coloring the line rust
// (which fails AA on the dark bg). The whisper voice stays; the caution reads.
const whisperWarningStyle: CSSProperties = {
  paddingBlock: 'var(--space-1)',
  paddingInline: 'var(--space-2)',
  borderRadius: 'var(--radius-chip)',
  borderLeft: '2px solid var(--color-rust)',
  background: 'color-mix(in srgb, var(--color-rust) 8%, transparent)',
};

// The card is now the Item-Engine object with a quiet body beneath — no wrapping
// surface/shadow of its own (the ItemSurface owns the elevation). `overflow`
// stays visible so the hover lift can rise past the tile bounds.
const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

// Product photos read better filled than contained; ItemSurface reserves the 4:5
// box and shows the cream surface through as a graceful placeholder while it loads.
const productImgStyle: CSSProperties = {
  objectFit: 'cover',
};

// Off-DOM probe: detects a broken product URL so we can fall the surface back to
// the brand initial before ever mounting a visibly-broken <img>.
const probeStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: 'none',
};

// Brand-initial fallback, centred over the (empty) surface via the badge slot.
const initialBadgeStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
  zIndex: 1,
};

const bodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
};

const priceRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
  margin: 0,
  marginTop: 'var(--space-1)',
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
