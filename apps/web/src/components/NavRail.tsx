'use client';

import { type CSSProperties, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import { glow, motion as motionToken } from '@era/tokens';
import { useTheme } from '../lib/theme';
import { glowShadow } from '../lib/glow';
import { pressProps, transitionFor, viewTransition } from '../lib/motion';
import { TAB_ITEMS, type TabId } from './TabBar';
import { Text } from './Text';

/** Press-enabled rail row — Link with the token tap affordance. */
const MotionLink = motion.create(Link);

/** Resolve the active tab from the first path segment; default to feed. */
function activeTabFrom(pathname: string): TabId {
  const segment = pathname.split('/')[1];
  return TAB_ITEMS.find((tab) => tab.id === segment)?.id ?? 'feed';
}

// The quiet-luxury rail: no glass, no border, no fill — it sits directly on the
// page background. `display` is intentionally omitted (the generated `.era-rail`
// rule owns the responsive show/hide toggle; flex properties stay inert until it
// turns display on).
const railStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  bottom: 0,
  width: 'var(--rail-width)',
  flexDirection: 'column',
  paddingTop: 'var(--space-8)',
  paddingBottom: 'var(--space-8)',
  paddingInline: 'var(--space-6)',
  zIndex: 40,
};

const wordmarkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  textDecoration: 'none',
  color: 'var(--color-text)',
  marginBottom: 'var(--space-8)',
};

// Ovi's small orb beside the wordmark — a quarter of the FAB, carrying the same
// accent glow recipe and breathing on the 3s pulse loop.
const orbStyle: CSSProperties = {
  width: 'var(--rail-orb)',
  height: 'var(--rail-orb)',
  borderRadius: 'var(--radius-full)',
  background: 'var(--color-accent)',
  flex: 'none',
};

const navGroupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const rowStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  minHeight: 'var(--touch-target-min)',
  textDecoration: 'none',
};

// Fixed-width slot reserving space for the glow dot on every row, so the label
// never shifts as the dot fades in/out on hover or active.
const dotSlotStyle: CSSProperties = {
  width: 'var(--rail-dot)',
  height: 'var(--rail-dot)',
  flex: 'none',
  display: 'inline-flex',
};

const dotStyle: CSSProperties = {
  width: 'var(--rail-dot)',
  height: 'var(--rail-dot)',
  borderRadius: 'var(--radius-full)',
  background: 'var(--color-accent)',
};

// A whisper-quiet Settings link, generously separated below the nav group.
const settingsStyle: CSSProperties = {
  marginTop: 'auto',
  textDecoration: 'none',
  color: 'var(--color-secondary)',
};

/**
 * The desktop left rail (D5 nav). Client component so it can track hover state
 * and drive the active/hover glow-dot + label-color transitions with motion.
 * Rendered by the (tabs) layout above the lg breakpoint (`.era-rail` owns the
 * show/hide). Tab switches route through the View Transitions API for the same
 * cross-fade the rest of the shell uses.
 */
export function NavRail() {
  const pathname = usePathname();
  const router = useRouter();
  const reduced = useReducedMotion();
  const { resolved } = useTheme();
  const active = activeTabFrom(pathname);
  const [hovered, setHovered] = useState<TabId | null>(null);
  const [settingsHovered, setSettingsHovered] = useState(false);

  const navigate = (id: TabId) => viewTransition(() => router.push(`/${id}`));

  // Orb pulse — mirrors OviFab exactly: scale + glow between rest and peak on
  // the 3s loop, static at base opacity under reduced motion.
  const baseOpacity = glow.opacity[resolved];
  const restShadow = glowShadow(baseOpacity);
  const peakShadow = glowShadow(baseOpacity + glow.pulse.amount);
  const orbAnimate = reduced
    ? { boxShadow: restShadow }
    : {
        scale: [1, 1 + glow.pulse.amount, 1],
        boxShadow: [restShadow, peakShadow, restShadow],
      };
  const orbTransition = reduced
    ? undefined
    : {
        duration: glow.pulse.durationMs / 1000,
        repeat: Infinity,
        ease: motionToken.easing.bezier,
      };

  // The dot rests at the mode's base glow opacity when active, or fades to 40%
  // on hover of an inactive row (0 otherwise).
  const dotShadow = glowShadow(baseOpacity);

  return (
    <nav className="era-rail" style={railStyle} aria-label="Primary">
      <MotionLink href="/feed" style={wordmarkStyle} {...pressProps(reduced)}>
        <Text variant="title" as="span">
          era
        </Text>
        <motion.span
          aria-hidden="true"
          style={{ ...orbStyle, boxShadow: restShadow }}
          animate={orbAnimate}
          transition={orbTransition}
        />
      </MotionLink>

      <div style={navGroupStyle}>
        {TAB_ITEMS.map((tab) => {
          const isActive = tab.id === active;
          const isHovered = hovered === tab.id;
          // Active → full base opacity; hover on inactive → 40%; else hidden.
          const dotOpacity = isActive ? 1 : isHovered ? 0.4 : 0;
          const labelColor =
            isActive || isHovered
              ? 'var(--color-text)'
              : 'var(--color-secondary-strong)';
          return (
            <MotionLink
              key={tab.id}
              href={`/${tab.id}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                navigate(tab.id);
              }}
              onHoverStart={() => setHovered(tab.id)}
              onHoverEnd={() => setHovered((h) => (h === tab.id ? null : h))}
              style={rowStyle}
              {...pressProps(reduced)}
            >
              <span style={dotSlotStyle}>
                <motion.span
                  aria-hidden="true"
                  style={{ ...dotStyle, boxShadow: dotShadow }}
                  initial={false}
                  animate={{ opacity: dotOpacity }}
                  transition={transitionFor(motionToken.springs.snappy, reduced)}
                />
              </span>
              <motion.span
                initial={false}
                animate={{ color: labelColor }}
                transition={transitionFor(motionToken.springs.gentle, reduced)}
              >
                <Text variant="ui" weight={500}>
                  {tab.label}
                </Text>
              </motion.span>
            </MotionLink>
          );
        })}
      </div>

      <MotionLink
        href="/settings"
        style={settingsStyle}
        onHoverStart={() => setSettingsHovered(true)}
        onHoverEnd={() => setSettingsHovered(false)}
        {...pressProps(reduced)}
      >
        <motion.span
          initial={false}
          animate={{
            color: settingsHovered
              ? 'var(--color-secondary-strong)'
              : 'var(--color-secondary)',
          }}
          transition={transitionFor(motionToken.springs.gentle, reduced)}
        >
          <Text variant="ui" weight={500}>
            Settings
          </Text>
        </motion.span>
      </MotionLink>
    </nav>
  );
}
