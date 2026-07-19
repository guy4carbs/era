import { type CSSProperties, type ElementType, type ReactNode } from 'react';

/**
 * The ONE glass recipe (§3). Every frosted surface — sheets, the tab bar, the
 * desktop rail, toasts, the Design Lab panels — composes its look from this
 * builder so blur, saturation, tint, border and highlight can never drift.
 *
 * The `busy` flag is the minimum-contrast scrim: it swaps the tint to the
 * AA-guaranteed `--glass-tint-busy`, whose dark value is derived so cream text
 * clears 4.5:1 over ANY backdrop (see the glass token's `busyTintOpacity` doc —
 * the guarantee is machine-checked in tokens.test.ts). Surfaces that float over
 * IMAGERY (cutouts, try-on renders, product photos) set it; chrome-backed
 * surfaces leave it off and keep the lighter everyday tint.
 */
export function glassSurfaceStyle(opts?: {
  busy?: boolean;
  shadow?: 'e3' | 'e4';
  radius?: string;
}): CSSProperties {
  const { busy = false, shadow = 'e4', radius } = opts ?? {};
  const tintVar = busy ? 'var(--glass-tint-busy)' : 'var(--glass-tint)';
  // Blur + the §3 saturation boost so garments glow slightly through the glass.
  const filter = 'blur(var(--glass-blur)) saturate(var(--glass-saturate))';
  return {
    background: `color-mix(in srgb, var(--color-surface) ${tintVar}, transparent)`,
    backdropFilter: filter,
    WebkitBackdropFilter: filter,
    border: 'var(--glass-border-width) solid var(--glass-border)',
    // Elevation plus a 1px inner highlight along the top edge (glass token colour).
    boxShadow: `var(--shadow-${shadow}), inset 0 1px 0 0 var(--glass-highlight)`,
    borderRadius: radius ?? 'var(--radius-sheet)',
  };
}

export interface GlassPanelProps {
  children?: ReactNode;
  /** Float over imagery — swaps to the AA-guaranteed minimum-contrast scrim. */
  busy?: boolean;
  /** Elevation depth of the recipe's box-shadow (default e4). */
  shadow?: 'e3' | 'e4';
  /** Corner radius override (default `var(--radius-sheet)`). */
  radius?: string;
  /** Element to render (default div). */
  as?: ElementType;
  style?: CSSProperties;
  className?: string;
}

/**
 * Thin component over `glassSurfaceStyle` — a server-safe wrapper (pure styles,
 * no hooks) for the common case of "give me a glass box." Reach for the builder
 * directly when a surface needs to merge the recipe with positional or motion
 * styles (sheets, the tab bar).
 */
export function GlassPanel({
  children,
  busy,
  shadow,
  radius,
  as,
  style,
  className,
}: GlassPanelProps) {
  const Tag = as ?? 'div';
  return (
    <Tag
      className={className}
      style={{ ...glassSurfaceStyle({ busy, shadow, radius }), ...style }}
    >
      {children}
    </Tag>
  );
}
