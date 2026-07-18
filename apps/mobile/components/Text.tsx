/**
 * Text — the single typed text primitive for the Era mobile app.
 *
 * Every text node in the app renders through here so the frozen type contract in
 * `@era/tokens` (`typeRoles` + `serifGuard`) is the only place sizes, faces, and
 * the serif rules live. A `variant` picks the semantic role; `size` optionally
 * overrides the role's default step (a `typeRamp` key or a raw px number).
 *
 * Face selection, NOT style flags, carries weight and italic on mobile:
 *   - serif roles resolve to the baked static instance (`role.mobileFamily`) —
 *     each TTF already bakes its weight/italic/optical size, so we must NOT set
 *     `fontWeight`/`fontStyle` or iOS synthesizes a faux (double) oblique/bold.
 *   - sans roles resolve to the nearest bundled Geist weight via
 *     `mobileSansFamily`, again leaving `fontWeight` unset (the family is the
 *     weight).
 *
 * In dev, every render runs the shared `assertVariantAllowed` guard and warns
 * (never throws) when a serif escapes into a control or below the size floor.
 * Controls declare themselves by wrapping their label region in
 * `TextControlBoundary`.
 */
import {
  isSerifVariant,
  mobileSansFamily,
  roleSizePx,
  typeRoles,
  assertVariantAllowed,
  type TypeRampStep,
  type TypeVariant,
} from '@era/tokens';
import { createContext, useContext, type ReactNode } from 'react';
import {
  Text as RNText,
  type StyleProp,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';

import { useTheme } from '@/lib/theme';

/**
 * True inside a Button/Chip/Input label region. The dev guard reads this so a
 * serif variant used inside a control warns. Default false — most of the app is
 * not a control.
 */
const TextControlContext = createContext(false);

/** Wrap a control's label region so serif-in-control warns in dev. */
export function TextControlBoundary({ children }: { readonly children: ReactNode }) {
  return <TextControlContext.Provider value={true}>{children}</TextControlContext.Provider>;
}

interface TextProps extends Omit<RNTextProps, 'style'> {
  readonly variant: TypeVariant;
  /** Override the role's default size — a `typeRamp` step name or raw px. */
  readonly size?: TypeRampStep | number;
  /** Only used to pick the nearest Geist weight for sans variants. */
  readonly weight?: number;
  readonly color?: string;
  readonly style?: StyleProp<TextStyle>;
  readonly children?: ReactNode;
}

export function Text({
  variant,
  size,
  weight,
  color,
  style,
  maxFontSizeMultiplier = 1.4,
  ...rest
}: TextProps) {
  const { colors } = useTheme();
  const inControl = useContext(TextControlContext);

  // `display` is web-only — on mobile it has no static instance, so fall back to
  // the largeTitle role's face and warn. Everything else resolves normally.
  const resolvedVariant: TypeVariant = variant === 'display' ? 'largeTitle' : variant;
  if (__DEV__ && variant === 'display') {
    console.warn('[era-type] variant "display" is web-only — falling back to largeTitle on mobile.');
  }

  const role = typeRoles[resolvedVariant];
  const serif = isSerifVariant(resolvedVariant);
  const sizePx = roleSizePx(resolvedVariant, size);

  // Serif → the baked static instance; sans → nearest Geist weight. Neither sets
  // fontWeight/fontStyle: the family already carries weight and (for oviAccent)
  // italic, and setting them would trigger iOS faux styling.
  const fontFamily = serif ? role.mobileFamily : mobileSansFamily(weight ?? role.weight);
  const lineHeight = Math.round(sizePx * role.leading);

  if (__DEV__) {
    const check = assertVariantAllowed(resolvedVariant, { sizePx, inControl });
    if (!check.ok) {
      console.warn(`[era-type] ${check.reason}`);
    }
  }

  return (
    <RNText
      {...rest}
      allowFontScaling
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        {
          fontFamily,
          fontSize: sizePx,
          lineHeight,
          // Explicitly normal — the static instance bakes weight/italic; leaving
          // these to inherit or synthesize would double-apply on iOS.
          fontStyle: 'normal',
          color: color ?? colors.text,
        },
        style,
      ]}
    />
  );
}
