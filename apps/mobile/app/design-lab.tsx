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
  orb,
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
import { GlassPanel } from '@/components/GlassPanel';
import { Input } from '@/components/Input';
import { OviFab } from '@/components/OviFab';
import { OviOrb, type OviOrbState } from '@/components/ovi';
import { Text } from '@/components/Text';
import { ItemSurface, type ForcedState } from '@/components/items';
import { animate, useReducedMotionSafe } from '@/lib/motion';
import { ThemeScope, useTheme } from '@/lib/theme';

const MODES: readonly ThemeMode[] = ['light', 'dark'];
const ELEVATIONS: readonly ElevationLevel[] = ['e1', 'e2', 'e3', 'e4'];
const SPRINGS = ['gentle', 'snappy', 'fluid'] as const;

// The six garment categories shown in the Item Engine matrix, each mapped to its
// reference cutout (transparent PNG, 515×640, in assets/design-lab). The value is
// the `number` `require()` returns — passed straight to ItemSurface's `uri`. A
// `null` here falls back to the surface's token-gradient placeholder, so a future
// category with no asset still degrades gracefully.
/* eslint-disable @typescript-eslint/no-require-imports -- Metro requires static require() literals for bundled assets; ItemSurface's uri takes the module ref, not an import path. */
const ITEM_LAB_ASSETS: Readonly<Record<string, string | number | null>> = {
  top: require('@/assets/design-lab/top.png'),
  bottom: require('@/assets/design-lab/bottom.png'),
  shoes: require('@/assets/design-lab/shoes.png'),
  outerwear: require('@/assets/design-lab/outerwear.png'),
  dress: require('@/assets/design-lab/dress.png'),
  accessory: require('@/assets/design-lab/accessory.png'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

const ITEM_LAB_CATEGORIES = Object.keys(ITEM_LAB_ASSETS);

// The forced states painted per row, plus the live pressable specimen column.
const ITEM_LAB_STATES: readonly ForcedState[] = ['rest', 'lift', 'tilt', 'selected'];

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

        <Section title="Ovi orb">
          <TwoUp render={() => <OviOrbColumn />} />
        </Section>

        <Section title="Sheen">
          <TwoUp render={(mode) => <SheenColumn mode={mode} />} />
        </Section>

        <Section title="Item Engine">
          <ItemEngineMatrix />
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
        <GlassPanel radius={radii.sheet} style={styles.glassPanel}>
          <View style={styles.glassLabel}>
            <Text variant="body" color={colors.text}>Frosted glass</Text>
            <Text variant="caption" color={colors.secondary}>tint {glass.tintOpacity[mode]}</Text>
          </View>
        </GlassPanel>
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

/**
 * OviOrbColumn — the living orb across its full matrix: the three canonical
 * sizes (corner / header / panel) × the three states (idle / thinking /
 * speaking), each forced via the orb's `state` prop so the assembly reads at a
 * glance. Painted inside the island's ThemeScope so light/dark both show.
 */
const ORB_STATES: readonly OviOrbState[] = ['idle', 'thinking', 'speaking'];
const ORB_SIZES: readonly (keyof typeof orb.size)[] = ['cornerPx', 'headerPx', 'panelPx'];

function OviOrbColumn() {
  const { colors } = useTheme();
  const reduced = useReducedMotionSafe();
  return (
    <View style={styles.stack}>
      {ORB_STATES.map((state) => (
        <View key={state} style={styles.orbStateRow}>
          <Text variant="caption" size="footnote" color={colors.secondary} style={styles.orbStateLabel}>
            {state}
          </Text>
          <View style={styles.orbSizeRow}>
            {ORB_SIZES.map((size) => (
              <OviOrb key={size} state={state} size={size} />
            ))}
          </View>
        </View>
      ))}
      <Text variant="caption" color={colors.secondary}>
        corner {orb.size.cornerPx} · header {orb.size.headerPx} · panel {orb.size.panelPx} · static under reduce ({reduced ? 'on' : 'off'})
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
 * ItemEngineMatrix — the ItemSurface engine across its full state space.
 *
 * BOTH modes as light|dark ThemeScope islands; within each, the six garment
 * categories (rows) × the four forced states (rest / lift / tilt / selected,
 * columns), plus one LIVE pressable specimen per category so the hero press-lift
 * can be felt, not just seen. The forced columns are static poses (no handlers),
 * so a screenshot captures the whole matrix at rest.
 *
 * Assets: each specimen's cutout comes from ITEM_LAB_ASSETS (real transparent
 * cutouts in assets/design-lab). A `null` manifest entry would fall back to the
 * surface's token-gradient placeholder, so an undrawn category degrades
 * gracefully. Add/swap path documented above the manifest + in the asset README.
 */
function ItemEngineMatrix() {
  return (
    <View style={styles.stack}>
      <View style={styles.twoUp}>
        {MODES.map((mode) => (
          <ThemeScope key={mode} mode={mode}>
            <ItemEngineIsland mode={mode} />
          </ThemeScope>
        ))}
      </View>
      <ItemEngineCaption />
    </View>
  );
}

function ItemEngineIsland({ mode }: { mode: ThemeMode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.island, { backgroundColor: colors.bg, borderColor: colors.hairline }]}>
      <Text variant="ui" size="footnote" weight={600} color={colors.secondaryStrong} style={styles.islandLabel}>
        {mode.toUpperCase()}
      </Text>
      {/* Column headers: the four forced states, then the live specimen. */}
      <View style={styles.itemLabHeaderRow}>
        <View style={styles.itemLabRowLabel} />
        {ITEM_LAB_STATES.map((state) => (
          <Text key={state} variant="caption" color={colors.secondary} style={styles.itemLabColLabel}>
            {state}
          </Text>
        ))}
        <Text variant="caption" color={colors.secondary} style={styles.itemLabColLabel}>
          live
        </Text>
      </View>
      {ITEM_LAB_CATEGORIES.map((category) => {
        const asset = ITEM_LAB_ASSETS[category] ?? null;
        return (
          <View key={category} style={styles.itemLabRow}>
            <Text variant="caption" size="footnote" color={colors.text} style={styles.itemLabRowLabel} numberOfLines={1}>
              {category}
            </Text>
            {ITEM_LAB_STATES.map((state) => (
              <View key={state} style={styles.itemLabCell}>
                <ItemSurface
                  uri={asset}
                  accessibilityLabel={`${category} ${state}`}
                  interactive="none"
                  forcedState={state}
                />
              </View>
            ))}
            {/* Live specimen — a real pressable surface; press to feel the lift. */}
            <View style={styles.itemLabCell}>
              <ItemSurface
                uri={asset}
                accessibilityLabel={`${category} live`}
                interactive="press"
                onPress={() => undefined}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ItemEngineCaption() {
  const { colors } = useTheme();
  return (
    <Text variant="caption" color={colors.secondary}>
      Rows = categories, columns = forced states; the last column is a live
      pressable surface. Specimens: assets/design-lab/&lt;category&gt;.png (a null
      manifest entry falls back to a token placeholder).
    </Text>
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
 * BusyImageryColumn — the glass recipe floated over a deliberately busy scene,
 * shown TWICE per island: the DEFAULT tint next to the BUSY (AA-scrim) tint. On
 * dark, the busy panel is the scrim PROOF — the default tint drops below 4.5:1
 * over bright noise while the busy tint stays legible. Each panel carries sample
 * body text so the difference is read directly, not inferred.
 *
 * The scene is layered RN Views + expo-linear-gradient stripes at varying angles
 * (no SVG, no new deps), so the frosted panels have real high-frequency colour
 * to blur against.
 */
function BusyImageryColumn({ mode }: { mode: ThemeMode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.busyStage, { borderRadius: radii.card, borderColor: colors.hairline }]}>
      <BusyBackground />
      <View style={styles.busyRow}>
        <GlassPanel radius={radii.sheet} style={styles.busyGlass}>
          <View style={styles.glassLabel}>
            <Text variant="ui" size="footnote" weight={600} color={colors.secondaryStrong}>DEFAULT</Text>
            <Text variant="body" size="footnote" color={colors.text}>The quick brown fox reads clearly.</Text>
            <Text variant="caption" color={colors.secondary}>tint {glass.tintOpacity[mode]}</Text>
          </View>
        </GlassPanel>
        <GlassPanel busy radius={radii.sheet} style={styles.busyGlass}>
          <View style={styles.glassLabel}>
            <Text variant="ui" size="footnote" weight={600} color={colors.secondaryStrong}>BUSY (AA scrim)</Text>
            <Text variant="body" size="footnote" color={colors.text}>The quick brown fox reads clearly.</Text>
            <Text variant="caption" color={colors.secondary}>tint {glass.busyTintOpacity[mode]}</Text>
          </View>
        </GlassPanel>
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
  orbStateRow: { gap: spacing.s1 },
  orbStateLabel: { textTransform: 'uppercase', letterSpacing: 1 },
  orbSizeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s4 },
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
  // GlassPanel owns radius/border/overflow; these just size + centre content.
  glassPanel: {
    width: '80%',
    height: '60%',
    justifyContent: 'center',
  },
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
  // Two panels side by side (DEFAULT vs BUSY) over the busy backdrop.
  busyRow: {
    flexDirection: 'row',
    gap: spacing.s2,
    paddingHorizontal: spacing.s3,
  },
  busyGlass: {
    flex: 1,
    justifyContent: 'center',
  },
  // Item Engine matrix — a header row + one row per category, each a label plus
  // the forced-state cells and the live specimen. Cells are small so all five
  // fit an island column; each ItemSurface keeps its own 4:5 aspect.
  itemLabHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.s1,
  },
  itemLabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
  },
  itemLabRowLabel: {
    width: spacing.s12,
  },
  itemLabColLabel: {
    flex: 1,
    textAlign: 'center',
  },
  itemLabCell: {
    flex: 1,
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
