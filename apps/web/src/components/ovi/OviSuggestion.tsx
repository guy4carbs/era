'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { motion as motionToken } from '@era/tokens';
import { strings } from '@era/core/strings';
import type { OviSuggestion as OviSuggestionData } from '@era/core/ovi';
import { transitionFor } from '../../lib/motion';
import { glassSurfaceStyle } from '../GlassPanel';
import { Text } from '../Text';
import { OviOrb } from './OviOrb';

export interface OviSuggestionProps {
  /** The composed suggestion (line + action + intent), from a core `suggestFor*`. */
  suggestion: OviSuggestionData;
  /** Open Ovi pre-seeded with this suggestion's ask. */
  onOpen: (suggestion: OviSuggestionData) => void;
  /** The suggestion was dismissed (× or after a tap) — remove the strip. */
  onDismiss: (suggestion: OviSuggestionData) => void;
}

/** localStorage namespace holding the dismissed suggestion keys (a JSON array). */
const DISMISSED_KEY = 'era-ovi-suggest-dismissed';

/** SSR-safe read of the dismissed-key set; empty off-DOM or on any failure. */
function readDismissed(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

/** True if THIS suggestion's key was dismissed before. Mirrors the reveal-seen pattern. */
export function isSuggestionDismissed(key: string): boolean {
  return readDismissed().includes(key);
}

/** Persist a dismissal so THIS suggestion (per surface + subject) stays quiet. Best-effort. */
export function markSuggestionDismissed(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    const next = Array.from(new Set([...readDismissed(), key]));
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  } catch {
    // Private mode / disabled storage: the dismissal just won't persist across reloads.
  }
}

/**
 * OviSuggestion — the ambient strip (D-AMBIENT). A small glass strip carrying the
 * 20px whisper orb (idle, non-interactive), ONE italic `oviAccent` line, ONE quiet
 * action, and a quiet dismiss ×. It is furniture, not a hero: the glass recipe at
 * e2, chip radius, no elevation drama.
 *
 * Grammar & rules (the spec's own words, enforced here):
 *   - Max ONE per screen — the caller renders at most one strip; this component
 *     is that one strip.
 *   - Dismissible and STAYS dismissed — × persists the suggestion's `key` in
 *     localStorage; the caller filters on {@link isSuggestionDismissed} so the
 *     strip never returns for that subject.
 *   - Never blocking — the caller places it in normal flow or a non-overlapping
 *     corner; the strip itself reserves no interactive space it shouldn't.
 *   - Entrance — a quiet fade-rise AFTER content settles: a `settleDelayMs` (800ms)
 *     hold, then the stagger fade-rise on the gentle spring. Reduced motion fades
 *     only, same delay.
 *
 * The line and the action both open Ovi pre-seeded (`onOpen`); the × and a tap
 * both remove the strip (`onDismiss`).
 */
export function OviSuggestion({ suggestion, onOpen, onDismiss }: OviSuggestionProps) {
  const reduced = useReducedMotion();
  // Hold the strip hidden until content has settled, then reveal. Mounting the
  // strip only after the delay keeps it out of the initial paint entirely, so it
  // can never contribute to first-settle CLS.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const handle = setTimeout(() => setShown(true), motionToken.suggestion.settleDelayMs);
    return () => clearTimeout(handle);
  }, []);

  if (!shown) return null;

  function handleOpen() {
    onOpen(suggestion);
  }

  function handleDismiss() {
    markSuggestionDismissed(suggestion.key);
    onDismiss(suggestion);
  }

  const enter = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, y: motionToken.stagger.riseYPx },
        animate: { opacity: 1, y: 0 },
      };

  return (
    <motion.aside
      style={stripStyle}
      aria-label={strings.ovi.fabLabel.split(',')[0]}
      initial={enter.initial}
      animate={enter.animate}
      transition={transitionFor(motionToken.springs.gentle, reduced)}
    >
      {/* The whisper orb — Ovi present, idle, non-interactive (decorative). */}
      <OviOrb size={{ cssVar: 'var(--orb-whisper)' }} state="idle" />

      {/* The line — one italic oviAccent beat at body size (the sanctioned serif
          floor exception). Tapping it opens Ovi pre-seeded, same as the action. */}
      <button type="button" style={lineButtonStyle} onClick={handleOpen}>
        <Text variant="oviAccent" as="span" size="body" style={lineTextStyle}>
          {suggestion.line}
        </Text>
      </button>

      {/* The one action — a quiet text button, not a filled CTA. */}
      <motion.button
        type="button"
        style={actionStyle}
        onClick={handleOpen}
        whileTap={reduced ? undefined : { scale: motionToken.press.scale }}
        transition={transitionFor(motionToken.springs.snappy, reduced)}
      >
        <Text variant="ui" as="span" size="footnote" weight={600} style={{ color: 'var(--color-accent)' }}>
          {suggestion.action}
        </Text>
      </motion.button>

      {/* The quiet dismiss — keeps THIS suggestion quiet for good. */}
      <motion.button
        type="button"
        style={dismissStyle}
        aria-label={strings.ovi.suggest.dismissA11y}
        onClick={handleDismiss}
        whileTap={reduced ? undefined : { scale: motionToken.press.scale }}
        transition={transitionFor(motionToken.springs.snappy, reduced)}
      >
        <span aria-hidden="true">×</span>
      </motion.button>
    </motion.aside>
  );
}

const stripStyle: CSSProperties = {
  ...glassSurfaceStyle({ shadow: 'e3', radius: 'var(--radius-chip)' }),
  // e2 elevation — furniture, not a hero. The glass recipe defaults to e4/e3; we
  // stamp the strip's own quieter shadow over it (inner highlight kept from the recipe).
  boxShadow: 'var(--shadow-e2), inset 0 1px 0 0 var(--glass-highlight)',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  minHeight: 'var(--touch-target-min)',
  paddingInline: 'var(--space-3)',
  paddingBlock: 'var(--space-2)',
};

// The line wraps in a transparent, full-width-ish button so the whole line is a
// tap target (and keyboard-focusable) without looking like a control.
const lineButtonStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  border: 'none',
  background: 'transparent',
  padding: 0,
  margin: 0,
  textAlign: 'left',
  cursor: 'pointer',
};

// One line only, truncated with an ellipsis — the strip never grows to two lines.
const lineTextStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const actionStyle: CSSProperties = {
  flex: '0 0 auto',
  display: 'inline-flex',
  alignItems: 'center',
  border: 'none',
  background: 'transparent',
  padding: 0,
  cursor: 'pointer',
};

const dismissStyle: CSSProperties = {
  flex: '0 0 auto',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 'var(--space-6)',
  height: 'var(--space-6)',
  border: 'none',
  background: 'transparent',
  color: 'var(--color-secondary-strong)',
  cursor: 'pointer',
  lineHeight: 1,
};
