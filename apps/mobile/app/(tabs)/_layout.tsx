/**
 * Tab shell — the main signed-in surface.
 *
 * Wraps expo-router's JS `Tabs` navigator with OUR design-system TabBar via the
 * `tabBar` render prop (adapted below), and floats the Ovi FAB bottom-right,
 * clearing the tab bar + bottom safe-area inset. Route names match TabBar's
 * TabKey union so the adapter maps 1:1.
 */
import { layout, spacing } from '@era/tokens';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import * as Haptics from 'expo-haptics';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OviFab } from '@/components/OviFab';
import { TabBar, type TabKey } from '@/components/TabBar';

// Route files require a default export — expo-router discovers layouts this way.
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  // Float the FAB above the (non-absolute) tab bar and the home-indicator inset.
  const fabBottom = layout.tabBarHeight + insets.bottom + spacing.s3;

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <TabBarAdapter {...props} />}
      >
        <Tabs.Screen name="feed" />
        <Tabs.Screen name="closet" />
        <Tabs.Screen name="design" />
        <Tabs.Screen name="shop" />
      </Tabs>
      <OviFab style={[styles.fab, { bottom: fabBottom, right: spacing.s4 }]} />
    </View>
  );
}

/**
 * Bridges React Navigation's tab-bar props to our controlled {@link TabBar}.
 * The navigator's route names are the {@link TabKey} union, so `active` is the
 * focused route and `onChange` navigates (with a selection tick, Chip-style).
 */
function TabBarAdapter({ state, navigation }: BottomTabBarProps) {
  const active = state.routes[state.index]?.name as TabKey;
  return (
    <TabBar
      active={active}
      onChange={(key) => {
        if (key === active) return;
        void Haptics.selectionAsync();
        navigation.navigate(key);
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fab: { position: 'absolute' },
});
