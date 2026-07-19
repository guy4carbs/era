/**
 * GlassPanel — the ONE frosted-glass recipe for mobile.
 *
 * Every glass surface in the app (sheets, the tab bar, floating pills) composes
 * the same §3 stack so the material reads identically everywhere:
 *
 *   1. BlurView (backdrop blur at `glass.blur`, tinted by the resolved mode)
 *   2. a translucent tint View (the surface colour at the mode's tint opacity)
 *   3. a 1px LinearGradient top-edge inner highlight (the catch-light)
 *   4. children, painted above the stack
 *
 * finished with the 1px per-mode border and a continuous (squircle) corner.
 *
 * THREE deliberate design notes live here so callers never have to relearn them:
 *
 * (a) `busy` = the AA scrim. When glass floats over IMAGERY (cutouts, try-on
 *     renders, feed photos) the default tint can't guarantee legible text — the
 *     dark default (0.62) drops to ~4.0:1 over a worst-case bright backdrop and
 *     FAILS WCAG AA. Passing `busy` swaps to `glass.busyTintOpacity[mode]`
 *     (dark bumped to 0.88, machine-checked in tokens.test.ts to clear 4.5:1
 *     over ANY backdrop; light is already safe at 0.72 so it's unchanged). On
 *     busy glass the tint IS the surface colour, so label text stays `colors.text`
 *     — that's exactly the text-on-glass pair the contrast audit certifies.
 *
 * (b) iOS gets REAL platform blur (UIVisualEffectView); Android uses expo-blur's
 *     default translucent tint fallback. This is a deliberate perf choice — the
 *     experimental Android blur method janks under scroll/drag — so Android leans
 *     harder on the tint layer for separation. The divergence is documented, not
 *     faked.
 *
 * (c) No saturation on mobile. The web recipe carries `backdrop-filter: ...
 *     saturate(1.1)` so garments glow through; BlurView exposes no saturation
 *     control. iOS system materials already apply mild vibrancy, so the gap is
 *     cosmetic — we don't fake it with an overlay.
 *
 * The glass LAYERS are STATIC by contract: nothing here animates the BlurView's
 * intensity or tint (those must not change per render — see TabBar/GlassSheet,
 * which animate only transform/opacity on separate views). A `null` shadow keeps
 * the panel flat; sheets/pills that lift pass 'e3'/'e4'.
 */
import { glass, radii, rnShadow, spacing } from '@era/tokens';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, type PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

interface GlassPanelProps {
  /** Float over imagery → swap to the AA scrim tint (see note (a)). */
  readonly busy?: boolean;
  /** Corner radius; defaults to the sheet radius. */
  readonly radius?: number;
  /** Elevation level, or null (default) for a flat panel. */
  readonly shadow?: 'e3' | 'e4' | null;
  readonly style?: StyleProp<ViewStyle>;
}

function GlassPanelImpl({
  busy = false,
  radius = radii.sheet,
  shadow = null,
  style,
  children,
}: PropsWithChildren<GlassPanelProps>) {
  const { colors, resolved } = useTheme();
  const tintOpacity = busy ? glass.busyTintOpacity[resolved] : glass.tintOpacity[resolved];

  return (
    <View
      style={[
        styles.panel,
        {
          borderRadius: radius,
          borderColor: glass.border[resolved],
          borderWidth: glass.borderWidth,
        },
        shadow ? rnShadow(shadow, resolved) : null,
        style,
      ]}
    >
      <BlurView
        intensity={glass.blur}
        tint={resolved === 'dark' ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, opacity: tintOpacity }]}
      />
      <LinearGradient
        colors={[glass.innerHighlightColor[resolved], 'transparent']}
        style={styles.innerHighlight}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

/**
 * Memoised: glass renders under scrolling FlatLists (tab bar over the feed) and
 * must not re-render when the list scrolls. Props are primitives/stable refs, so
 * a shallow compare holds it static during scroll — a load-bearing perf choice.
 */
export const GlassPanel = memo(GlassPanelImpl);

const styles = StyleSheet.create({
  panel: {
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  // The catch-light is a gradient (highlight colour → transparent), so it needs
  // a fade band, not a hard 1px line — spacing.s8 matches the established recipe.
  innerHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: spacing.s8,
  },
});
