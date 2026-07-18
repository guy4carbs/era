'use client';

import {
  createContext,
  createElement,
  useContext,
  type CSSProperties,
  type JSX,
  type ReactNode,
} from 'react';
import {
  typeRoles,
  typeRamp,
  fontFamilies,
  roleSizePx,
  assertVariantAllowed,
  isSerifVariant,
  type TypeVariant,
  type TypeRampStep,
} from '@era/tokens';

/**
 * `<Text>` — the single web typography primitive.
 *
 * A role (`variant`) fixes the family, weight, italic, leading, tracking, and —
 * for serif roles — the Fraunces optical axes; SIZE is separate (each role has a
 * default step, overridable via `size`). Every rendered text node in the web app
 * goes through here so the type system is enforced in one place and there are no
 * stray `fontFamily` declarations. Fonts are loaded at the root layout and read
 * through the `--font-era-serif` / `--font-era-sans` CSS variables.
 */

export interface TextProps {
  /** The semantic type role. Required — there is no unstyled fallback. */
  variant: TypeVariant;
  /** Size override: a ramp step name or a raw px number. Defaults to the role's. */
  size?: TypeRampStep | number;
  /** Weight override; defaults to the role's weight. */
  weight?: number;
  /** Element override; each variant has a sensible default (see {@link DEFAULT_ELEMENT}). */
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  [key: string]: unknown;
}

/**
 * Signals to a nested `<Text>` that it is rendering inside a control
 * (Button/Chip/Input), where serif variants are forbidden. Wrapper controls set
 * this via {@link TextControlBoundary}; the dev guard reads it.
 */
const TextControlContext = createContext(false);

/** Marks its subtree as "inside a control" for the serif dev guard. */
export function TextControlBoundary({ children }: { children: ReactNode }) {
  return (
    <TextControlContext.Provider value={true}>{children}</TextControlContext.Provider>
  );
}

/** Default HTML element per role — headings for the loud roles, inline otherwise. */
const DEFAULT_ELEMENT: Record<TypeVariant, keyof JSX.IntrinsicElements> = {
  display: 'h1',
  largeTitle: 'h2',
  title: 'h3',
  oviAccent: 'span',
  body: 'p',
  ui: 'span',
  caption: 'span',
};

/** Resolve the CSS `fontSize` for a role + optional override, in rem. */
function resolveFontSize(variant: TypeVariant, size?: TypeRampStep | number): string {
  const role = typeRoles[variant];
  // Web `display` renders as a fluid clamp unless an explicit size is passed.
  if (variant === 'display' && role.webClamp && size === undefined) {
    return role.webClamp;
  }
  if (typeof size === 'number') {
    return `${size / 16}rem`;
  }
  const step = size ?? role.defaultSize;
  return typeRamp[step].rem;
}

export function Text({
  variant,
  size,
  weight,
  as,
  className,
  style,
  children,
  ...rest
}: TextProps) {
  const role = typeRoles[variant];
  const inControl = useContext(TextControlContext);

  if (process.env.NODE_ENV !== 'production') {
    const check = assertVariantAllowed(variant, {
      sizePx: roleSizePx(variant, size),
      inControl,
    });
    if (!check.ok) {
      console.warn('[era-type] ' + check.reason);
    }
  }

  const serif = isSerifVariant(variant);
  const fontFamily = serif
    ? `var(${fontFamilies.cssVar.serif}), ${fontFamilies.serifFallback}`
    : `var(${fontFamilies.cssVar.sans}), ${fontFamilies.sansFallback}`;

  const typeStyle: CSSProperties = {
    fontFamily,
    fontSize: resolveFontSize(variant, size),
    fontWeight: weight ?? role.weight,
    lineHeight: role.leading,
    letterSpacing: role.letterSpacing ?? undefined,
    color: 'inherit',
    ...(serif
      ? {
          fontVariationSettings: `'opsz' ${role.opsz ?? 0}, 'SOFT' ${role.soft}, 'WONK' 0`,
          fontStyle: role.italic ? 'italic' : 'normal',
        }
      : null),
    ...style,
  };

  const element = as ?? DEFAULT_ELEMENT[variant];
  return createElement(element, { className, style: typeStyle, ...rest }, children);
}
