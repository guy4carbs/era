'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { motion as fmotion, useReducedMotion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { elevation, motion as motionToken, spacing } from '@era/tokens';
import { strings } from '@era/core/strings';
import { slotForCategory, type OutfitSlot, type ProposedOutfit } from '@era/core/ovi';

import { transitionFor } from '../../lib/motion';
import { analytics, trackFirstOnce } from '../../lib/analytics';
import { useSession } from '../../lib/auth-client';
import { Text } from '../Text';
import { Button } from '../Button';
import { acceptOutfit, logWear, rejectOutfit } from './ovi-actions';
import { exportTodayStory } from './reveal-export';
import type { ItemsById, OviWeather } from './types';

/**
 * The Today's Look reveal — Era's signature daily ritual (D9). A staged moment:
 * a cream 'Today' canvas, the look assembling piece by piece (each cutout on the
 * gentle spring, its shadow landing a beat behind), settling into the composed
 * card with Ovi's one italic line and two quiet actions.
 *
 * This is the ONE Today surface. When the wearer has already seen today's
 * reveal, the parent renders it `initiallySettled` so it opens straight on the
 * composed card — no re-assembly. Everything animates from token motion
 * (`motion.reveal`); the sequence is driven by a single `revealStep` counter
 * advanced by timers, so a tap can fast-forward it to the settled state.
 */

/** The pieces the reveal composes, resolved from ids to cutouts + slot. */
interface RevealPiece {
  id: string;
  url: string | null;
  name: string;
  slot: OutfitSlot | null;
}

export interface RevealStageProps {
  /** The look to reveal — its item ids resolve against `itemsById`. */
  outfit: ProposedOutfit;
  /** Cutout lookup for the outfit's pieces (from `GET /api/items`). */
  itemsById: ItemsById;
  /** Ovi's one editorial line, shown in italic on the settled card. */
  revealLine: string | null;
  /** Weather Ovi styled around — leads the cream canvas when present. */
  weather: OviWeather | null;
  /**
   * Skip the staged assembly and open directly on the composed card. Set by the
   * parent when today's reveal has already been seen (once-per-day staging).
   */
  initiallySettled?: boolean;
  /** Coarse coords the surface already resolved, forwarded to the wear log. */
  wearLocation?: { lat: number; lon: number } | null;
  /** Fired once the sequence settles or is skipped — the parent marks the day. */
  onRevealComplete?: () => void;
  /** Toast text the parent should surface after a save / share / an error. */
  onToast: (message: string) => void;
  /** Fired after a dismissal so the parent can retreat the surface. */
  onDismissed: () => void;
}

/**
 * Paint order for a layered, artful stack: shoes at the bottom, then bottom,
 * base (top/dress), outerwear, accessory on top. Mirrors the same slot groups
 * `composeStyling` fills, so the stack reads the way the look was assembled.
 */
const SLOT_STACK_ORDER: readonly OutfitSlot[] = [
  'shoes',
  'bottom',
  'base',
  'outerwear',
  'accessory',
];

/** Small artful offsets per slot so the stack reads layered, not gridded. */
const SLOT_OFFSET: Record<OutfitSlot, { x: number; y: number; scale: number }> = {
  shoes: { x: -14, y: 34, scale: 0.72 },
  bottom: { x: 10, y: 14, scale: 0.86 },
  base: { x: -6, y: -8, scale: 1 },
  outerwear: { x: 18, y: -2, scale: 0.92 },
  accessory: { x: -24, y: -30, scale: 0.5 },
};

/** Order pieces bottom-of-stack first; unknown-slot pieces trail, in id order. */
function orderPieces(pieces: readonly RevealPiece[]): RevealPiece[] {
  const rank = (slot: OutfitSlot | null): number =>
    slot ? SLOT_STACK_ORDER.indexOf(slot) : SLOT_STACK_ORDER.length;
  return [...pieces].sort((a, b) => rank(a.slot) - rank(b.slot));
}

/**
 * Per-item interval, compressed so the whole sequence fits the gift budget.
 * With ≤5 items this is the token interval (350ms); a longer list tightens to
 * `(maxTotalMs - settleMs) / n` — the frozen formula from the contract.
 */
function intervalForCount(count: number): number {
  const { itemIntervalMs, settleMs, maxTotalMs } = motionToken.reveal;
  if (count <= 0) {
    return itemIntervalMs;
  }
  return Math.min(itemIntervalMs, (maxTotalMs - settleMs) / count);
}

const stageStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  aspectRatio: '4 / 5',
  background: 'var(--color-bg)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-e2)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-3)',
  padding: 'var(--space-6)',
  cursor: 'pointer',
  isolation: 'isolate',
};

const canvasCopyStyle: CSSProperties = {
  position: 'absolute',
  top: 'var(--space-6)',
  left: 'var(--space-6)',
  right: 'var(--space-6)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  zIndex: 2,
  pointerEvents: 'none',
};

const stackStyle: CSSProperties = {
  position: 'relative',
  width: '68%',
  height: '78%',
  alignSelf: 'center',
  marginTop: 'auto',
  marginBottom: 'auto',
};

const settledCopyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const actionsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  flexWrap: 'wrap',
};

// The soft ground shadow a piece lands on — warm ink squashed to an ellipse at
// the e4 token opacity (the Stories export's grammar), softened by a
// token-derived blur. A whisper of ground contact, never a painted smear.
const groundShadowOpacity = elevation.e4.opacity;
const groundShadowStyle: CSSProperties = {
  position: 'absolute',
  left: '19%',
  right: '19%',
  bottom: '2%',
  height: '7%',
  borderRadius: 'var(--radius-full)',
  background: 'var(--color-ink)',
  filter: `blur(${spacing.s3}px)`,
};

// The bare garment fills its reserved box — no card chrome on the stage.
const cutoutImgStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  display: 'block',
};

const pieceWrapStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

/**
 * One layered cutout in the assembling stack. The piece springs in on the gentle
 * spring; its shadow follows `shadowLagMs` behind via a second, delayed opacity
 * tween on a paired shadow element (so the drop reads as a piece landing, then
 * casting). Once revealed (or under reduced motion) both sit at rest.
 */
function StackPiece({
  piece,
  index,
  revealed,
  reduced,
}: {
  piece: RevealPiece;
  index: number;
  revealed: boolean;
  reduced: boolean | null;
}) {
  const offset = piece.slot ? SLOT_OFFSET[piece.slot] : { x: 0, y: 0, scale: 0.8 };
  const spring = transitionFor(motionToken.springs.gentle, reduced);
  const shadowDelay = reduced ? 0 : motionToken.reveal.shadowLagMs / 1000;

  return (
    <div
      style={{
        ...pieceWrapStyle,
        zIndex: index + 1,
        transform: `translate(${offset.x}%, ${offset.y}%) scale(${offset.scale})`,
      }}
    >
      <fmotion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.96 }}
        animate={
          revealed
            ? reduced
              ? { opacity: 1 }
              : { opacity: 1, y: 0, scale: 1 }
            : reduced
              ? { opacity: 0 }
              : { opacity: 0, y: 18, scale: 0.96 }
        }
        transition={spring}
        style={{ position: 'relative', width: '78%', height: '78%' }}
      >
        {/* The GARMENT layers, not a card — a stack of full ItemSurface cards
            buried each other (user: "what is this for" at a blank card corner,
            2026-07-19). The stage now matches the Stories export's grammar:
            the bare cutout on the cream canvas, landing on a soft ground
            shadow a beat later (ink at the e3-ambient token opacity — a
            whisper, never the full-opacity smear that was rejected earlier). */}
        <fmotion.div
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: revealed ? groundShadowOpacity : 0 }}
          transition={{ ...spring, delay: revealed ? shadowDelay : 0 }}
          style={groundShadowStyle}
        />
        {piece.url ? <img src={piece.url} alt={piece.name} style={cutoutImgStyle} /> : null}
      </fmotion.div>
    </div>
  );
}

export function RevealStage({
  outfit,
  itemsById,
  revealLine,
  weather,
  initiallySettled = false,
  wearLocation,
  onRevealComplete,
  onToast,
  onDismissed,
}: RevealStageProps) {
  const reduced = useReducedMotion();
  const router = useRouter();
  const { data: session } = useSession();

  const pieces = useMemo(() => {
    const resolved: RevealPiece[] = outfit.itemIds.map((id) => {
      const info = itemsById.get(id);
      return {
        id,
        url: info?.displayUrl ?? null,
        name: info?.name ?? '',
        slot: info ? slotForCategory(info.category) : null,
      };
    });
    return orderPieces(resolved);
  }, [outfit.itemIds, itemsById]);

  // The sequence counter. 0 = cream canvas; k (1..n) = k pieces landed;
  // n+1 = settled. `initiallySettled` (or reduced motion) opens at the end.
  const total = pieces.length;
  const settledStep = total + 1;
  const startStep = initiallySettled ? settledStep : 0;
  const [step, setStep] = useState<number>(startStep);
  const settled = step >= settledStep;

  // Pending timers, cleared on skip/unmount so a fast-forward cancels the rest.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const completedRef = useRef(false);

  const fireComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onRevealComplete?.();
  }, [onRevealComplete]);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  }, []);

  const skipToSettled = useCallback(() => {
    if (settled) return;
    clearTimers();
    setStep(settledStep);
    fireComplete();
  }, [settled, settledStep, clearTimers, fireComplete]);

  useEffect(() => {
    // Already settled on mount (seen today, or reduced-motion cross-fade path):
    // nothing to schedule — mark the day and rest.
    if (initiallySettled) {
      fireComplete();
      return;
    }
    if (reduced) {
      // Reduced motion: a single sanctioned cross-fade, no assembly. The
      // reduced-fade duration lets the cream canvas dissolve into the card.
      const handle = setTimeout(() => {
        setStep(settledStep);
        fireComplete();
      }, motionToken.durations.reducedFadeMs);
      timers.current.push(handle);
      return clearTimers;
    }

    // Full assembly: advance one piece per interval, then the settle beat.
    const interval = intervalForCount(total);
    for (let k = 1; k <= total; k += 1) {
      const handle = setTimeout(() => setStep(k), interval * k);
      timers.current.push(handle);
    }
    const settleHandle = setTimeout(() => {
      setStep(settledStep);
      fireComplete();
    }, interval * total + motionToken.reveal.settleMs);
    timers.current.push(settleHandle);

    return clearTimers;
    // Intentionally runs once on mount — the sequence is a one-shot ritual and
    // must not restart if the parent re-renders. All values read here (reduced,
    // total, the token timings) are stable for the stage's lifetime.
  }, []);

  // ---- settled-card interaction (accept + wear, reject, share) ----
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function handleWear() {
    if (saveStatus !== 'idle') return;
    setSaveStatus('saving');
    const saved = await acceptOutfit(outfit, 'today');
    if (!saved) {
      setSaveStatus('idle');
      onToast(strings.errors.generic);
      return;
    }
    setSavedId(saved.id);
    setSaveStatus('saved');
    trackFirstOnce('first_outfit_saved', session?.user?.id, { via: 'ovi' });
    // Close the daily-wear loop: the reveal's "Wear it" both saves AND logs it.
    const logged = await logWear({
      outfitId: saved.id,
      lat: wearLocation?.lat ?? null,
      lon: wearLocation?.lon ?? null,
    });
    if (logged) {
      analytics.track('wear_logged', { via: 'today_reveal' });
      onToast(strings.ovi.woreItConfirmed);
    } else {
      // The look is saved; only the wear log missed. Say so honestly.
      onToast(strings.wear.logFailed);
    }
  }

  function handleElse() {
    void rejectOutfit(outfit, 'today');
    onToast(strings.ovi.rejected);
    onDismissed();
  }

  async function handleShare() {
    if (exporting) return;
    setExporting(true);
    onToast(strings.share.preparing);
    const ok = await exportTodayStory({ pieces, revealLine, weather });
    setExporting(false);
    if (!ok) onToast(strings.errors.generic);
  }

  const weatherLead =
    weather !== null
      ? strings.ovi.weatherLine(weather.tempC, weather.condition)
      : null;

  return (
    <section
      style={stageStyle}
      role="button"
      tabIndex={settled ? -1 : 0}
      aria-label={settled ? undefined : strings.reveal.skipA11y}
      onClick={settled ? undefined : skipToSettled}
      onKeyDown={
        settled
          ? undefined
          : (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                skipToSettled();
              }
            }
      }
    >
      {/* Cream-canvas copy: the day, and the weather whisper. Cross-fades out as
          the card settles. */}
      <fmotion.div
        style={canvasCopyStyle}
        initial={false}
        animate={{ opacity: settled ? 0 : 1 }}
        transition={transitionFor(motionToken.springs.gentle, reduced)}
      >
        <Text variant="largeTitle" as="h2" style={{ margin: 0, color: 'var(--color-text)' }}>
          {strings.reveal.title}
        </Text>
        {weatherLead ? (
          <Text variant="body" as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>
            {weatherLead}
          </Text>
        ) : null}
      </fmotion.div>

      {/* The assembling / assembled stack. */}
      <div style={stackStyle}>
        {pieces.map((piece, index) => (
          <StackPiece
            key={piece.id}
            piece={piece}
            index={index}
            revealed={settled || step > index}
            reduced={reduced}
          />
        ))}
      </div>

      {/* Settled card: Ovi's italic line + the two quiet actions + share. Fades
          in as the stack comes to rest. */}
      <fmotion.div
        style={{
          ...settledCopyStyle,
          alignSelf: 'stretch',
          zIndex: 3,
          pointerEvents: settled ? 'auto' : 'none',
        }}
        initial={false}
        animate={{ opacity: settled ? 1 : 0 }}
        transition={transitionFor(motionToken.springs.gentle, reduced)}
        onClick={(event) => event.stopPropagation()}
      >
        {revealLine ? (
          <Text variant="oviAccent" as="p" style={{ margin: 0, color: 'var(--color-text)' }}>
            {revealLine}
          </Text>
        ) : null}
        <div style={actionsStyle}>
          {saveStatus === 'saved' ? (
            <>
              <Text
                variant="caption"
                size="footnote"
                weight={600}
                as="span"
                style={{ color: 'var(--color-accent)' }}
              >
                {strings.ovi.accepted}
              </Text>
              <button
                type="button"
                onClick={() => router.push(`/design/canvas?outfit=${savedId ?? ''}`)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                <Text variant="caption" size="footnote" as="span" style={{ color: 'var(--color-secondary-strong)' }}>
                  Open →
                </Text>
              </button>
            </>
          ) : (
            <>
              <Button variant="primary" disabled={saveStatus === 'saving'} onClick={() => void handleWear()}>
                {strings.reveal.wearCta}
              </Button>
              <Button variant="ghost" disabled={saveStatus === 'saving'} onClick={handleElse}>
                {strings.reveal.elseCta}
              </Button>
            </>
          )}
          <button
            type="button"
            onClick={() => void handleShare()}
            disabled={exporting}
            aria-label={strings.reveal.shareCta}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 0, cursor: exporting ? 'default' : 'pointer' }}
          >
            <Text variant="caption" size="footnote" as="span" style={{ color: 'var(--color-secondary-strong)' }}>
              {exporting ? strings.share.preparing : strings.reveal.shareCta}
            </Text>
          </button>
        </div>
      </fmotion.div>
    </section>
  );
}
