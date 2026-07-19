/**
 * TabBar — the app's bottom navigation.
 *
 * A glass bar of fixed height plus the device's bottom safe-area inset. The
 * frosted material is the shared GlassPanel recipe (blur + tint + top-edge
 * highlight + border), radius 0 for the full-width bar; this file owns only the
 * tab layout, labels, and active-accent tint. Rendered as a controlled component
 * so it can live in the design lab now and be wired into expo-router later
 * (icons are labels-only until an icon set lands).
 */
import { layout } from '@era/tokens';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassPanel } from '@/components/GlassPanel';
import { Press } from '@/components/Press';
import { Text } from '@/components/Text';
import { useTheme } from '@/lib/theme';

export type TabKey = 'feed' | 'closet' | 'design' | 'shop';

const TABS: readonly { readonly key: TabKey; readonly label: string }[] = [
  { key: 'feed', label: 'Feed' },
  { key: 'closet', label: 'Closet' },
  { key: 'design', label: 'Design' },
  { key: 'shop', label: 'Shop' },
];

interface TabBarProps {
  readonly active: TabKey;
  readonly onChange: (tab: TabKey) => void;
}

export function TabBar({ active, onChange }: TabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      {/* Shared §3 glass recipe (blur + tint + top-edge highlight + border),
          radius 0 for the full-width bar. Static — the feed/closet/shop lists
          scroll UNDER this without re-rendering the glass. */}
      <GlassPanel radius={0} style={StyleSheet.absoluteFill} />
      <View
        style={[
          styles.row,
          { height: layout.tabBarHeight + insets.bottom, paddingBottom: insets.bottom },
        ]}
      >
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Press
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
              style={styles.tab}
              onPress={() => onChange(tab.key)}
            >
              <Text
                variant="ui"
                size="footnote"
                weight={isActive ? 600 : 400}
                color={isActive ? colors.accent : colors.secondaryStrong}
              >
                {tab.label}
              </Text>
            </Press>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // GlassPanel (absoluteFill) carries the top-edge glass border; the bar just
    // clips its own row to that edge.
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
