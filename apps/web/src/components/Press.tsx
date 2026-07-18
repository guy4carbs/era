'use client';

import {
  forwardRef,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { pressProps } from '../lib/motion';

/** The elements Press can render as. Button is the accessible default. */
export type PressAs = 'button' | 'div' | 'a';

export interface PressProps {
  /** Which element to render. Default `button` (keyboard + role for free). */
  as?: PressAs;
  onClick?: () => void;
  /** Anchor target — only meaningful when `as="a"`. */
  href?: string;
  disabled?: boolean;
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
  'aria-label'?: string;
}

/**
 * The universal pressable primitive: wrap any bare tappable that lacks press
 * feedback and it gains the token tap-scale (`pressProps`) on the snappy spring,
 * a pointer cursor, and — because it defaults to a real `<button>` — keyboard
 * activation and the app's global `:focus-visible` accent ring (globals.css).
 *
 * Renders motion.button / motion.div / motion.a per `as`. Under reduced motion
 * the scale collapses (transition degrades to the 150ms fade); a `disabled`
 * button also drops the press. For non-button roles pass an `aria-label`.
 */
export const Press = forwardRef<HTMLElement, PressProps>(function Press(
  { as = 'button', onClick, href, disabled, style, className, children, ...aria },
  ref,
) {
  const reduced = useReducedMotion();
  const interactive = !disabled;
  const press = pressProps(reduced, interactive);

  const baseStyle: CSSProperties = {
    cursor: disabled ? 'not-allowed' : 'pointer',
    ...style,
  };

  if (as === 'a') {
    return (
      <motion.a
        ref={ref as Ref<HTMLAnchorElement>}
        href={disabled ? undefined : href}
        onClick={onClick}
        className={className}
        style={baseStyle}
        {...press}
        {...aria}
      >
        {children}
      </motion.a>
    );
  }

  if (as === 'div') {
    return (
      <motion.div
        ref={ref as Ref<HTMLDivElement>}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        onClick={disabled ? undefined : onClick}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick?.();
          }
        }}
        className={className}
        style={baseStyle}
        {...press}
        {...aria}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.button
      ref={ref as Ref<HTMLButtonElement>}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={className}
      style={baseStyle}
      {...press}
      {...aria}
    >
      {children}
    </motion.button>
  );
});

Press.displayName = 'Press';
