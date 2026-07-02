/**
 * Design lab — a scrollable gallery of every design-system primitive.
 *
 * Dev-only screen: theme toggle, all components in both states, the type ramp,
 * elevation / radii / spacing swatches, the glow-pulse and spring demos, and a
 * live contrast audit (runContrastAudit) rendered as PASS/FAIL rows.
 */
import {
  radii,
  rnShadow,
  runContrastAudit,
  spacing,
  typeRamp,
  type ContrastAuditRow,
} from '@era/tokens';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { GlassSheet } from '@/components/GlassSheet';
import { Input } from '@/components/Input';
import { OviFab } from '@/components/OviFab';
import { TabBar, type TabKey } from '@/components/TabBar';
import { animate, useReducedMotionSafe } from '@/lib/motion';
import { useTheme, type ThemePreference } from '@/lib/theme';

const MODES: readonly ThemePreference[] = ['light', 'dark', 'system'];
const ELEVATIONS = ['e1', 'e2', 'e3', 'e4'] as const;
const SPRINGS = ['gentle', 'snappy', 'fluid'] as const;

export default function DesignLabScreen() {
  const { colors, mode, setMode } = useTheme();
  const reduced = useReducedMotionSafe();

  const [selectedChips, setSelectedChips] = useState<Record<string, boolean>>({
    minimal: true,
  });
  const [tab, setTab] = useState<TabKey>('closet');
  const [sheetOpen, setSheetOpen] = useState(false);

  const demoX = useSharedValue(0);
  const demoStyle = useAnimatedStyle(() => ({ transform: [{ translateX: demoX.value }] }));

  const audit = runContrastAudit();
  const passCount = audit.filter((r) => r.pass).length;

  const text = { color: colors.text };
  const secondary = { color: colors.secondary };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.h1, text, sized('largeTitle')]}>Design Lab</Text>

        <Section title="Theme">
          <View style={styles.rowWrap}>
            {MODES.map((m) => (
              <Chip
                key={m}
                label={m}
                selected={mode === m}
                haptic={false}
                onToggle={() => setMode(m)}
              />
            ))}
          </View>
        </Section>

        <Section title="Buttons">
          <Button label="Primary" variant="primary" haptic onPress={() => undefined} />
          <Button label="Secondary" variant="secondary" onPress={() => undefined} />
          <Button label="Ghost" variant="ghost" onPress={() => undefined} />
          <Button label="Disabled" variant="primary" disabled onPress={() => undefined} />
        </Section>

        <Section title="Inputs">
          <Input placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
          <Input placeholder="With error" error="That email looks off." />
        </Section>

        <Section title="Chips">
          <View style={styles.rowWrap}>
            {['minimal', 'street', 'classic', 'bold'].map((c) => (
              <Chip
                key={c}
                label={c}
                selected={selectedChips[c] ?? false}
                onToggle={(next) =>
                  setSelectedChips((prev) => ({ ...prev, [c]: next }))
                }
              />
            ))}
          </View>
        </Section>

        <Section title="Card">
          <Card aspect="item" style={styles.cardDemo}>
            <Text style={[secondary, sized('footnote')]}>4:5 item card</Text>
          </Card>
        </Section>

        <Section title="Type ramp">
          {Object.entries(typeRamp).map(([role, spec]) => (
            <View key={role} style={styles.typeRow}>
              <Text style={[text, { fontSize: spec.px, lineHeight: spec.lineHeight }]}>
                {role}
              </Text>
              <Text style={[secondary, sized('caption')]}>{spec.px}px</Text>
            </View>
          ))}
        </Section>

        <Section title="Elevation">
          <View style={styles.rowWrap}>
            {ELEVATIONS.map((level) => (
              <View
                key={level}
                style={[
                  styles.swatch,
                  rnShadow(level),
                  { backgroundColor: colors.surface, borderRadius: radii.card },
                ]}
              >
                <Text style={[secondary, sized('caption')]}>{level}</Text>
              </View>
            ))}
          </View>
          <Text style={[secondary, sized('caption')]}>
            {ELEVATIONS.length} levels · e3 is the dual-layer token (approximated as
            a single RN shadow)
          </Text>
        </Section>

        <Section title="Radii">
          <View style={styles.rowWrap}>
            {Object.entries(radii).map(([name, value]) => (
              <View key={name} style={styles.swatchWrap}>
                <View
                  style={[styles.swatch, { backgroundColor: colors.accent, borderRadius: value }]}
                />
                <Text style={[secondary, sized('caption')]}>{name}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Spacing">
          {Object.entries(spacing).map(([name, value]) => (
            <View key={name} style={styles.spacingRow}>
              <Text style={[secondary, sized('caption'), styles.spacingLabel]}>{name}</Text>
              <View style={[styles.spacingBar, { width: value, backgroundColor: colors.accent }]} />
              <Text style={[secondary, sized('caption')]}>{value}</Text>
            </View>
          ))}
        </Section>

        <Section title="Glow pulse (Ovi)">
          <View style={styles.center}>
            <OviFab onPress={() => setSheetOpen(true)} />
          </View>
          <Text style={[secondary, sized('caption')]}>
            3s breathing pulse · static under reduce motion ({reduced ? 'on' : 'off'})
          </Text>
        </Section>

        <Section title="Springs">
          <Animated.View
            style={[styles.dot, demoStyle, { backgroundColor: colors.accent }]}
          />
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
        </Section>

        <Section title="Contrast audit">
          <Text style={[text, sized('title3')]}>
            {passCount}/{audit.length} pass
          </Text>
          {audit.map((result) => (
            <ContrastRow key={result.id} result={result} />
          ))}
        </Section>

        <View style={{ height: spacing.s16 }} />
      </ScrollView>

      <TabBar active={tab} onChange={setTab} />
      <GlassSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <Text style={[text, sized('title3')]}>Ovi</Text>
        <Text style={[secondary, sized('body')]}>
          Tap the handle to expand. This is your stylist sheet.
        </Text>
      </GlassSheet>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[{ color: colors.secondaryStrong }, sized('subhead'), styles.sectionTitle]}>
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
        <Text style={{ color: result.fg, fontSize: typeRamp.caption.px }}>Aa</Text>
      </View>
      <View style={styles.contrastMeta}>
        <Text style={[{ color: colors.text }, sized('footnote')]}>{result.id}</Text>
        <Text style={[{ color: colors.secondary }, sized('caption')]}>
          {result.mode} · {result.usage} · needs {result.required.toFixed(1)}
        </Text>
      </View>
      <Text style={[{ color: colors.secondary }, sized('footnote')]}>
        {result.ratio.toFixed(2)}
      </Text>
      <Text style={[{ color: statusColor, fontWeight: '600' }, sized('footnote')]}>
        {result.pass ? 'PASS' : 'FAIL'}
      </Text>
    </View>
  );
}

/** Font size + line height for a type-ramp role (px is always numeric). */
function sized(role: keyof typeof typeRamp) {
  return { fontSize: typeRamp[role].px, lineHeight: typeRamp[role].lineHeight };
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.s4, gap: spacing.s6 },
  h1: { fontWeight: '700' },
  section: { gap: spacing.s2 },
  sectionTitle: { textTransform: 'uppercase', letterSpacing: 1 },
  sectionBody: { gap: spacing.s2 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2, alignItems: 'center' },
  cardDemo: { width: spacing.s16 * 3, alignItems: 'flex-start', justifyContent: 'flex-end' },
  typeRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  swatchWrap: { alignItems: 'center', gap: spacing.s1 },
  swatch: {
    width: spacing.s12,
    height: spacing.s12,
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  spacingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2 },
  spacingLabel: { width: spacing.s8 },
  spacingBar: { height: spacing.s2, borderRadius: radii.chip },
  center: { alignItems: 'center', paddingVertical: spacing.s4 },
  dot: { width: spacing.s8, height: spacing.s8, borderRadius: radii.hero },
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
