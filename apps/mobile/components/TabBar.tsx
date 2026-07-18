/**
 * TabBar — the app's bottom navigation.
 *
 * A glass (blurred) bar of fixed height plus the device's bottom safe-area
 * inset. Four tabs; the active one is tinted with the accent colour. Rendered
 * as a controlled component so it can live in the design lab now and be wired
 * into expo-router later (icons are labels-only until an icon set lands).
 */
import { glass, layout } from '@era/tokens';
import { BlurView } from 'expo-blur';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const { colors, resolved } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { borderTopColor: colors.hairline }]}>
      <BlurView
        intensity={glass.blur}
        tint={resolved === 'dark' ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, opacity: glass.tintOpacity[resolved] }]}
      />
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
    borderTopWidth: StyleSheet.hairlineWidth,
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
