'use client';

import { useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { motion as motionToken } from '@era/tokens';
import { Text } from '../Text';
import { strings } from '@era/core/strings';
import type { WhyDetail, WhyItemRef } from '@era/core/shop';
import { pressProps, transitionFor } from '../../lib/motion';
import { GlassSheet } from '../GlassSheet';

export interface WhyDetailSheetProps {
  /** The rich reasoning behind a pick — the owned pieces each signal rests on. */
  whyDetail: WhyDetail;
  /** Close the sheet (backdrop tap, Escape, or the close control). */
  onClose: () => void;
}

/**
 * The expanded "why" — Ovi's reasoning made checkable. Where {@link WhyLabel}
 * fits one honest line on the card, this names the ACTUAL closet pieces behind
 * each signal so the pull (or the "you may already own this" warning) is concrete,
 * not a black box.
 *
 * A modal dialog mirroring {@link OviChat}'s pattern: a tap-to-dismiss backdrop
 * under a {@link GlassSheet} (`role="dialog"` + `aria-modal`), Escape to close,
 * reduced-motion honored via {@link transitionFor}. Every line comes from
 * `strings.shop.whyDetail` — no fabricated copy. `completesWith`/`similarTo`
 * render each {@link WhyItemRef} with its cutout thumbnail (a quiet fallback tile
 * when the server left `imageUrl` unresolved); `fillsGap` and `paletteMatch` are
 * single lines shown only when present.
 */
export function WhyDetailSheet({ whyDetail, onClose }: WhyDetailSheetProps) {
  const reduced = useReducedMotion();

  // Escape closes the sheet, as expected of a modal dialog (matches OviChat).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { completesWith, similarTo, fillsGap, paletteMatch } = whyDetail;

  // The trigger lives inside a ShopCard whose article takes a transform on hover
  // — which would make it the containing block for this fixed-position sheet and
  // clip it under the card's `overflow: hidden`. Portal to the body so the sheet
  // escapes the card's stacking/overflow context entirely. (No document → SSR
  // pass renders nothing; the sheet only ever mounts on a user tap, client-side.)
  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <>
      <motion.div
        style={backdropStyle}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transitionFor(motionToken.springs.gentle, reduced)}
        onClick={onClose}
      />
      <GlassSheet labelledBy="shop-why-title">
        <div style={rootStyle}>
          <header style={headerStyle}>
            <Text variant="title" size="title3" as="h2" id="shop-why-title" weight={700} style={{ margin: 0, color: 'var(--color-text)' }}>
              {strings.shop.whyDetail.title}
            </Text>
            <motion.button
              type="button"
              style={closeStyle}
              aria-label={strings.common.cancel}
              onClick={onClose}
              {...pressProps(reduced)}
            >
              <Text variant="ui" as="span" size="title3" style={{ color: 'var(--color-secondary-strong)' }} aria-hidden="true">×</Text>
            </motion.button>
          </header>

          <div style={sectionsStyle}>
            {completesWith.length > 0 ? (
              <ul style={listStyle}>
                {completesWith.map((item) => (
                  <WhyItemRow
                    key={`completes-${item.id}`}
                    item={item}
                    line={strings.shop.whyDetail.completesWith(item.label)}
                  />
                ))}
              </ul>
            ) : null}

            {similarTo.length > 0 ? (
              <ul style={listStyle}>
                {similarTo.map((item) => (
                  <WhyItemRow
                    key={`similar-${item.id}`}
                    item={item}
                    line={strings.shop.whyDetail.similarTo(item.label)}
                  />
                ))}
              </ul>
            ) : null}

            {fillsGap ? (
              <Text variant="body" as="p" size="subhead" style={{ margin: 0, color: 'var(--color-text)' }}>
                {strings.shop.whyDetail.fillsGap(
                  strings.closet.categoryLabel(fillsGap.category).toLowerCase(),
                  fillsGap.ownedCount,
                )}
              </Text>
            ) : null}

            {paletteMatch.length > 0 ? (
              <Text variant="body" as="p" size="subhead" style={{ margin: 0, color: 'var(--color-text)' }}>
                {strings.shop.whyDetail.paletteMatch(paletteMatch.join(', '))}
              </Text>
            ) : null}
          </div>
        </div>
      </GlassSheet>
    </>,
    document.body,
  );
}

/** One owned-piece row: cutout thumbnail (or a quiet fallback tile) + the reason line. */
function WhyItemRow({ item, line }: { item: WhyItemRef; line: string }) {
  return (
    <li style={rowStyle}>
      {item.imageUrl ? (
        // Decorative — the reason line already names the piece, so the thumb is
        // supporting context, not the label.
        <img src={item.imageUrl} alt="" style={thumbStyle} loading="lazy" />
      ) : (
        <span aria-hidden="true" style={thumbFallbackStyle} />
      )}
      <Text variant="body" as="span" size="subhead" style={{ color: 'var(--color-text)' }}>{line}</Text>
    </li>
  );
}

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'color-mix(in srgb, var(--color-ink) 45%, transparent)',
  zIndex: 45,
};

const rootStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  paddingTop: 'var(--space-2)',
  paddingBottom: 'var(--space-4)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
};

const closeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 'var(--touch-target-min)',
  minHeight: 'var(--touch-target-min)',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
};

const sectionsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
};

const thumbStyle: CSSProperties = {
  flex: '0 0 auto',
  width: 'var(--space-8)',
  height: 'var(--space-8)',
  objectFit: 'cover',
  borderRadius: 'var(--radius-chip)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-hairline)',
};

const thumbFallbackStyle: CSSProperties = {
  flex: '0 0 auto',
  width: 'var(--space-8)',
  height: 'var(--space-8)',
  borderRadius: 'var(--radius-chip)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-hairline)',
};

