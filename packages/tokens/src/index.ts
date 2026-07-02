/**
 * @era/tokens — design tokens for the Era aesthetic.
 *
 * Warm cream/black base, glassy surfaces, soft glow, and spring-driven motion.
 * All tokens are frozen with `as const` so they carry literal types.
 */

export const colors = {
  cream: '#F7F3EC',
  ink: '#141210',
  mist: '#E6DFD3',
  ember: '#C8623B',
  sage: '#7C8B6F',
} as const;

export const surfaces = {
  glass: {
    background: 'rgba(247, 243, 236, 0.6)',
    blur: '20px',
    opacity: 0.6,
    borderColor: 'rgba(20, 18, 16, 0.08)',
  },
  glassDark: {
    background: 'rgba(20, 18, 16, 0.55)',
    blur: '24px',
    opacity: 0.55,
    borderColor: 'rgba(247, 243, 236, 0.1)',
  },
} as const;

export const glow = {
  soft: '0 0 24px rgba(200, 98, 59, 0.25)',
  focus: '0 0 0 3px rgba(200, 98, 59, 0.35)',
  ambient: '0 12px 48px rgba(20, 18, 16, 0.18)',
} as const;

export const motion = {
  spring: {
    gentle: { stiffness: 170, damping: 26 },
    snappy: { stiffness: 320, damping: 30 },
    bouncy: { stiffness: 260, damping: 18 },
  },
  duration: {
    fast: 120,
    base: 240,
    slow: 420,
  },
} as const;

export const radii = {
  none: '0px',
  sm: '6px',
  md: '12px',
  lg: '20px',
  xl: '28px',
  full: '9999px',
} as const;

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '40px',
  '2xl': '64px',
} as const;
