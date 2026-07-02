'use client';

import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  motion as motionToken,
  typeRamp,
  boxShadows,
  sheen,
  glow,
  layout,
} from '@era/tokens';
import { transitionFor } from '../lib/motion';
import { useTheme } from '../lib/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

type NativeButtonProps = Omit<
  React.ComponentPropsWithoutRef<'button'>,
  'onAnimationStart' | 'onAnimationEnd' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'style' | 'ref'
>;

export interface ButtonProps extends NativeButtonProps {
  variant?: ButtonVariant;
  children: ReactNode;
  style?: CSSProperties;
}

const baseStyle: CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-2)',
  minHeight: 'var(--touch-target-web)',
  paddingInline: 'var(--space-4)',
  borderRadius: 'var(--radius-input)',
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  fontWeight: 600,
  border: 'none',
  cursor: 'pointer',
  overflow: 'hidden',
  isolation: 'isolate',
  userSelect: 'none',
  boxShadow: boxShadows.e1,
};

const variantStyle: Record<ButtonVariant, CSSProperties> = {
  // Ink label on the accent fill reads at the highest contrast of the options.
  primary: { background: 'var(--color-accent)', color: 'var(--color-ink)' },
  secondary: {
    background: 'var(--color-surface)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-hairline)',
  },
  ghost: { background: 'transparent', color: 'var(--color-text)' },
};

/** Diagonal light sweep drawn over the accent fill (primary only). */
const sheenOverlay: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  background: `linear-gradient(${sheen.angleDeg}deg, ${sheen.from}, ${sheen.to})`,
  zIndex: 1,
};

const labelStyle: CSSProperties = { position: 'relative', zIndex: 2 };

/**
 * The Era action button. Springs on press, lifts + glows on hover; all motion
 * collapses to a static, reduced-motion-safe surface when the user prefers it.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', children, style, disabled, ...rest },
  ref,
) {
  const reduced = useReducedMotion();
  const { resolved } = useTheme();

  // Hover glow = accent shadow at (per-mode glow opacity × hover intensity).
  const glowPercent = Math.round(
    glow.opacity[resolved] * layout.hover.glowIntensity * 100,
  );
  const hoverGlow = `0 0 var(--glow-blur) color-mix(in srgb, var(--color-accent) ${glowPercent}%, transparent)`;

  const interactive = !disabled && !reduced;

  return (
    <motion.button
      ref={ref}
      type="button"
      disabled={disabled}
      style={{
        ...baseStyle,
        ...variantStyle[variant],
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
      whileHover={interactive ? { y: layout.hover.liftPx, boxShadow: hoverGlow } : undefined}
      whileTap={interactive ? { scale: 0.97 } : undefined}
      transition={transitionFor(motionToken.springs.snappy, reduced)}
      {...rest}
    >
      {variant === 'primary' ? <span style={sheenOverlay} aria-hidden="true" /> : null}
      <span style={labelStyle}>{children}</span>
    </motion.button>
  );
});
