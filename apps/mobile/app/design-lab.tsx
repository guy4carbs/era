/**
 * Design lab v2 — every primitive rendered in BOTH modes, side by side.
 *
 * Dev-only screen. Each section paints its content twice: a light `ThemeScope`
 * column and a dark one, so mode-aware tokens (shadows, glass, sheen, glow) can
 * be eyeballed against each other in a single scroll. The columns are theme
 * islands — every `useTheme()` consumer inside a `<ThemeScope mode>` reads that
 * island's palette regardless of the ambient app theme.
 *
 * Sections: palette, type roles, spacing, radii (incl. the `full` pill),
 * elevation e1–e4 (light vs dark recipes), glass recipe, glow + Ovi pulse,
 * sheen (locations [0, 0.6], per-mode from), components, motion playground, glass
 * over busy imagery, and the contrast audit grouped by mode.
 *
 * Busy-imagery path: layered RN Views + expo-linear-gradient stripes at varying
 * angles — no SVG, no new deps. expo-image's SVG-data-URI support is fragile
 * across SDKs, so the guaranteed-to-render View stack is used instead.
 */
import {
  elevation,
  elevationDark,
  glass,
  glow,
  radii,
  rnShadow,
  runContrastAudit,
  sheen,
  spacing,
  typeRoles,
  type ContrastAuditRow,
  type ElevationLevel,
  type ThemeMode,
} from '@era/tokens';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import { StyleSheet, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Input } from '@/components/Input';
import { OviFab } from '@/components/OviFab';
import { Text } from '@/components/Text';
import { animate, useReducedMotionSafe } from '@/lib/motion';
import { ThemeScope, useTheme } from '@/lib/theme';

const MODES: readonly ThemeMode[] = ['light', 'dark'];
const ELEVATIONS: readonly ElevationLevel[] = ['e1', 'e2', 'e3', 'e4'];
const SPRINGS = ['gentle', 'snappy', 'fluid'] as const;

// The seven type roles, in visual-weight order. `display` is web-only (opsz 144)
// and falls back to largeTitle on mobile — labelled so the fallback is legible.
const TYPE_ROLES = [
  'display',
  'largeTitle',
  'title',
  'oviAccent',
  'body',
  'ui',
  'caption',
] as const;

// The palette roles carried by every mode, plus the mode-independent semantics,
// rendered as swatches with their resolved hex. Read live from the island theme.
const PALETTE_ROLES = [
  'bg',
  'surface',
  'text',
  'secondary',
  'secondaryStrong',
  'accent',
  'hairline',
] as const;

export default function DesignLabScreen() {
  // The screen chrome reads the ambient app theme; every section body is pinned.
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="largeTitle" color={colors.text}>Design Lab</Text>
        <Text variant="caption" color={colors.secondary}>
          Every primitive, light vs dark, side by side.
        </Text>

        <Section title="Palette">
          <TwoUp render={() => <PaletteColumn />} />
        </Section>

        <Section title="Type roles">
          <TwoUp render={() => <TypeColumn />} />
        </Section>

        <Section title="Spacing">
          <TwoUp render={() => <SpacingColumn />} />
        </Section>

        <Section title="Radii">
          <TwoUp render={() => <RadiiColumn />} />
        </Section>

        <Section title="Elevation e1–e4">
          <TwoUp render={(mode) => <ElevationColumn mode={mode} />} />
        </Section>

        <Section title="Glass recipe">
          <TwoUp render={(mode) => <GlassColumn mode={mode} />} />
        </Section>

        <Section title="Glow + Ovi pulse">
          <TwoUp render={() => <GlowColumn />} />
        </Section>

        <Section title="Sheen">
          <TwoUp render={(mode) => <SheenColumn mode={mode} />} />
        </Section>

        <Section title="Components">
          <TwoUp render={() => <ComponentsColumn />} />
        </Section>

        <Section title="Motion playground">
          <MotionPlayground />
        </Section>

        <Section title="Glass over busy imagery">
          <TwoUp render={(mode) => <BusyImageryColumn mode={mode} />} />
        </Section>

        <Section title="Contrast audit">
          <ContrastAudit />
        </Section>

        <View style={{ height: spacing.s16 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * TwoUp — renders `render` inside a light island column and a dark one, each
 * painted with that island's `bg`. The two flex columns sit side by side.
 */
function TwoUp({ render }: { render: (mode: ThemeMode) => ReactNode }) {
  return (
    <View style={styles.twoUp}>
      {MODES.map((mode) => (
        <ThemeScope key={mode} mode={mode}>
          <IslandColumn mode={mode}>{render(mode)}</IslandColumn>
        </ThemeScope>
      ))}
    </View>
  );
}

/** One island column: the pinned bg with a mode caption, then the content. */
function IslandColumn({ mode, children }: { mode: ThemeMode; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.island, { backgroundColor: colors.bg, borderColor: colors.hairline }]}>
      <Text variant="ui" size="footnote" weight={600} color={colors.secondaryStrong} style={styles.islandLabel}>
        {mode.toUpperCase()}
      </Text>
      <View style={styles.islandBody}>{children}</View>
    </View>
  );
}

function PaletteColumn() {
  const { colors } = useTheme();
  return (
    <View style={styles.stack}>
      {PALETTE_ROLES.map((role) => (
        <View key={role} style={styles.paletteRow}>
          <View style={[styles.paletteSwatch, { backgroundColor: colors[role], borderColor: colors.hairline }]} />
          <View style={styles.paletteMeta}>
            <Text variant="caption" size="footnote" color={colors.text}>{role}</Text>
            <Text variant="caption" color={colors.secondary}>{String(colors[role])}</Text>
          </View>
        </View>
      ))}
      <View style={styles.paletteRow}>
        <View style={[styles.paletteSwatch, { backgroundColor: colors.success, borderColor: colors.hairline }]} />
        <View style={styles.paletteMeta}>
          <Text variant="caption" size="footnote" color={colors.text}>success (sage)</Text>
          <Text variant="caption" color={colors.secondary}>{String(colors.success)}</Text>
        </View>
      </View>
      <View style={styles.paletteRow}>
        <View style={[styles.paletteSwatch, { backgroundColor: colors.danger, borderColor: colors.hairline }]} />
        <View style={styles.paletteMeta}>
          <Text variant="caption" size="footnote" color={colors.text}>danger (rust)</Text>
          <Text variant="caption" color={colors.secondary}>{String(colors.danger)}</Text>
        </View>
      </View>
    </View>
  );
}

function TypeColumn() {
  const { colors } = useTheme();
  return (
    <View style={styles.stack}>
      {TYPE_ROLES.map((role) => (
        <View key={role} style={styles.typeRow}>
          {/* `display` is web-only; it falls back to largeTitle here. */}
          <Text variant={role} color={colors.text}>
            {role}
          </Text>
          <Text variant="caption" color={colors.secondary}>
            {typeRoles[role].defaultSize}
            {role === 'display' ? ' · web-only' : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SpacingColumn() {
  const { colors } = useTheme();
  return (
    <View style={styles.stack}>
      {Object.entries(spacing).map(([name, value]) => (
        <View key={name} style={styles.spacingRow}>
          <Text variant="caption" color={colors.secondary} style={styles.spacingLabel}>{name}</Text>
          <View style={[styles.spacingBar, { width: value, backgroundColor: colors.accent }]} />
          <Text variant="caption" color={colors.secondary}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function RadiiColumn() {
  const { colors } = useTheme();
  return (
    <View style={styles.rowWrap}>
      {Object.entries(radii).map(([name, value]) => (
        <View key={name} style={styles.swatchWrap}>
          <View
            style={[
              // `full` (9999) saturates any box into a pill/orb.
              name === 'full' ? styles.pill : styles.swatch,
              { backgroundColor: colors.accent, borderRadius: value },
            ]}
          />
          <Text variant="caption" color={colors.secondary}>{name}</Text>
        </View>
      ))}
    </View>
  );
}

function ElevationColumn({ mode }: { mode: ThemeMode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stack}>
      <View style={styles.rowWrap}>
        {ELEVATIONS.map((level) => (
          <View
            key={level}
            style={[
              styles.swatch,
              // The dark recipes visibly differ (heavier ambient; e4 is black 0.45).
              rnShadow(level, mode),
              { backgroundColor: colors.surface, borderRadius: radii.card },
            ]}
          >
            <Text variant="caption" color={colors.secondary}>{level}</Text>
          </View>
        ))}
      </View>
      <Text variant="caption" color={colors.secondary}>
        e4 opacity {mode === 'dark' ? elevationDark.e4.opacity : elevation.e4.opacity}
        {mode === 'dark' ? ' · true black' : ' · warm ink'}
      </Text>
    </View>
  );
}

function GlassColumn({ mode }: { mode: ThemeMode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stack}>
      <View style={styles.glassStage}>
        {/* A colourful backdrop so the tint + blur read as real glass. */}
        <LinearGradient
          colors={[colors.accent, colors.surface, colors.bg]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            styles.glassPanel,
            { borderColor: glass.border[mode], borderWidth: glass.borderWidth, borderRadius: radii.sheet },
          ]}
        >
          <BlurView intensity={glass.blur} tint={mode === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          {/* Mode tint at glass.tintOpacity[mode]. */}
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, opacity: glass.tintOpacity[mode] }]}
          />
          {/* Top-edge inner highlight, per mode. */}
          <LinearGradient
            colors={[glass.innerHighlightColor[mode], 'transparent']}
            style={styles.glassHighlight}
            pointerEvents="none"
          />
          <View style={styles.glassLabel}>
            <Text variant="body" color={colors.text}>Frosted glass</Text>
            <Text variant="caption" color={colors.secondary}>tint {glass.tintOpacity[mode]}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function GlowColumn() {
  const { colors } = useTheme();
  const reduced = useReducedMotionSafe();
  return (
    <View style={styles.stack}>
      <View style={styles.center}>
        <OviFab onPress={() => undefined} />
      </View>
      <Text variant="caption" color={colors.secondary}>
        3s breathing pulse · glow {glow.opacity.light}/{glow.opacity.dark} · static under reduce ({reduced ? 'on' : 'off'})
      </Text>
    </View>
  );
}

function SheenColumn({ mode }: { mode: ThemeMode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stack}>
      <View style={[styles.sheenStage, { backgroundColor: colors.surface, borderRadius: radii.card }]}>
        {/* Per-mode `from`; reaches transparent at 60% via locations [0, 0.6]. */}
        <LinearGradient
          colors={[sheen.from[mode], sheen.to]}
          locations={[0, 0.6]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <Text variant="caption" color={colors.secondary}>
        {sheen.from[mode]} → transparent @ {sheen.stopPercent}%
      </Text>
    </View>
  );
}

function ComponentsColumn() {
  const { colors } = useTheme();
  const [chipOn, setChipOn] = useState(true);
  return (
    <View style={styles.stack}>
      <Button label="Primary" variant="primary" onPress={() => undefined} />
      <Button label="Secondary" variant="secondary" onPress={() => undefined} />
      <View style={styles.rowWrap}>
        <Chip label="chip" selected={chipOn} haptic={false} onToggle={setChipOn} />
        <Chip label="off" selected={false} haptic={false} onToggle={() => undefined} />
      </View>
      <Input placeholder="you@example.com" autoCapitalize="none" />
      <Card aspect="item" style={styles.cardDemo}>
        <Text variant="caption" size="footnote" color={colors.secondary}>4:5 card</Text>
      </Card>
    </View>
  );
}

/**
 * MotionPlayground — the springs demo (gentle/snappy/fluid) plus the live
 * reduced-motion state. Not mode-split: motion reads identically in both.
 */
function MotionPlayground() {
  const { colors } = useTheme();
  const reduced = useReducedMotionSafe();
  const demoX = useSharedValue(0);
  const demoStyle = useAnimatedStyle(() => ({ transform: [{ translateX: demoX.value }] }));
  return (
    <View style={styles.stack}>
      <Animated.View style={[styles.dot, demoStyle, { backgroundColor: colors.accent }]} />
      <View style={styles.rowWrap}>
        {SPRINGS.map((preset) => (
          <Button
            key={preset}
            label={preset}
            variant="secondary"
            onPress={() => {
              const target = demoX.value > 0 ? 0 : spacing.s16 * 2;
              demoX.value = animate(target, reduced, preset);
            }}
          />
        ))}
      </View>
      <Text variant="caption" color={colors.secondary}>
        Reduced motion is {reduced ? 'ON — springs swap to a fade' : 'OFF'}.
      </Text>
    </View>
  );
}

/**
 * BusyImageryColumn — the glass recipe floated over a deliberately busy scene.
 * The scene is built from layered RN Views + expo-linear-gradient stripes at
 * varying angles (no SVG, no new deps), so the frosted panel has real high-
 * frequency colour to blur against.
 */
function BusyImageryColumn({ mode }: { mode: ThemeMode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.busyStage, { borderRadius: radii.card, borderColor: colors.hairline }]}>
      <BusyBackground />
      <View
        style={[
          styles.busyGlass,
          { borderColor: glass.border[mode], borderWidth: glass.borderWidth, borderRadius: radii.sheet },
        ]}
      >
        <BlurView intensity={glass.blur} tint={mode === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, opacity: glass.tintOpacity[mode] }]} />
        <LinearGradient
          colors={[glass.innerHighlightColor[mode], 'transparent']}
          style={styles.glassHighlight}
          pointerEvents="none"
        />
        <View style={styles.glassLabel}>
          <Text variant="body" color={colors.text}>Glass over noise</Text>
          <Text variant="caption" color={colors.secondary}>readable through the blur</Text>
        </View>
      </View>
    </View>
  );
}

/** Layered angled gradient stripes over vivid blocks — a no-SVG busy scene. */
function BusyBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={['#E94F37', '#3F88C5', '#44BBA4', '#F6AE2D']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.6)', 'transparent', 'rgba(0,0,0,0.5)', 'transparent']}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['transparent', 'rgba(233,79,55,0.7)', 'transparent', 'rgba(63,136,197,0.7)']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

/**
 * ContrastAudit — the runContrastAudit() rows grouped by mode, each with an
 * N/N-pass headline. Rendered against the ambient theme (the swatches carry
 * their own bg/fg from the audit rows).
 */
function ContrastAudit() {
  const { colors } = useTheme();
  const audit = runContrastAudit();
  return (
    <View style={styles.stack}>
      {MODES.map((mode) => {
        const rows = audit.filter((r) => r.mode === mode);
        const pass = rows.filter((r) => r.pass).length;
        return (
          <View key={mode} style={styles.auditGroup}>
            <Text variant="title" size="title3" color={colors.text}>
              {mode} · {pass}/{rows.length} pass
            </Text>
            {rows.map((row) => (
              <ContrastRow key={row.id} result={row} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text variant="ui" color={colors.secondaryStrong} style={styles.sectionTitle}>
        {title}
      </Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function ContrastRow({ result }: { result: ContrastAuditRow }) {
  const { colors } = useTheme();
  const statusColor = result.pass ? colors.success : colors.danger;
  return (
    <View style={styles.contrastRow}>
      <View style={[styles.contrastSwatch, { backgroundColor: result.bg }]}>
        <Text variant="caption" color={result.fg}>Aa</Text>
      </View>
      <View style={styles.contrastMeta}>
        <Text variant="caption" size="footnote" color={colors.text}>{result.id}</Text>
        <Text variant="caption" color={colors.secondary}>
          {result.usage} · needs {result.required.toFixed(1)}
        </Text>
      </View>
      <Text variant="caption" size="footnote" color={colors.secondary}>
        {result.ratio.toFixed(2)}
      </Text>
      <Text variant="ui" size="footnote" weight={600} color={statusColor}>
        {result.pass ? 'PASS' : 'FAIL'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.s4, gap: spacing.s6 },
  section: { gap: spacing.s2 },
  sectionTitle: { textTransform: 'uppercase', letterSpacing: 1 },
  sectionBody: { gap: spacing.s2 },
  twoUp: { flexDirection: 'row', gap: spacing.s2 },
  island: {
    flex: 1,
    padding: spacing.s3,
    gap: spacing.s2,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
    borderCurve: 'continuous',
  },
  islandLabel: { letterSpacing: 1 },
  islandBody: { gap: spacing.s2 },
  stack: { gap: spacing.s2 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2, alignItems: 'center' },
  paletteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2 },
  paletteSwatch: {
    width: spacing.s8,
    height: spacing.s8,
    borderRadius: radii.chip,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
  },
  paletteMeta: { flex: 1 },
  typeRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.s2 },
  spacingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2 },
  spacingLabel: { width: spacing.s8 },
  spacingBar: { height: spacing.s2, borderRadius: radii.chip },
  swatchWrap: { alignItems: 'center', gap: spacing.s1 },
  swatch: {
    width: spacing.s12,
    height: spacing.s12,
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  pill: {
    width: spacing.s16,
    height: spacing.s8,
    borderCurve: 'continuous',
  },
  cardDemo: { width: spacing.s16 * 2, alignItems: 'flex-start', justifyContent: 'flex-end' },
  center: { alignItems: 'center', paddingVertical: spacing.s4 },
  dot: { width: spacing.s8, height: spacing.s8, borderRadius: radii.full },
  glassStage: {
    height: spacing.s16 * 2,
    borderRadius: radii.card,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  glassPanel: {
    width: '80%',
    height: '60%',
    overflow: 'hidden',
    borderCurve: 'continuous',
    justifyContent: 'center',
  },
  glassHighlight: { position: 'absolute', top: 0, left: 0, right: 0, height: spacing.s8 },
  glassLabel: { padding: spacing.s3, gap: spacing.s1 },
  sheenStage: {
    height: spacing.s16,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  busyStage: {
    height: spacing.s16 * 2,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
    justifyContent: 'center',
    alignItems: 'center',
  },
  busyGlass: {
    width: '82%',
    height: '58%',
    overflow: 'hidden',
    borderCurve: 'continuous',
    justifyContent: 'center',
  },
  auditGroup: { gap: spacing.s1 },
  contrastRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2 },
  contrastMeta: { flex: 1 },
  contrastSwatch: {
    width: spacing.s8,
    height: spacing.s8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.chip,
    borderCurve: 'continuous',
  },
});
