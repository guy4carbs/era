/**
 * Tab shell — the main signed-in surface.
 *
 * Wraps expo-router's JS `Tabs` navigator with OUR design-system TabBar via the
 * `tabBar` render prop (adapted below), and floats the Ovi FAB bottom-right,
 * clearing the tab bar + bottom safe-area inset. Route names match TabBar's
 * TabKey union so the adapter maps 1:1.
 *
 * The whole shell sits inside a {@link TabBarVisibilityProvider} so the floating
 * pill can hide on scroll-down and return on scroll-up: each scrolling tab wires
 * the provider's `scrollHandler`, and the adapter calls `show()` on every tab
 * change so a bar left hidden re-reveals when you return to that tab.
 */
import { layout, spacing } from '@era/tokens';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OviFab } from '@/components/OviFab';
import { OviChat } from '@/components/ovi';
import { OviStateProvider } from '@/components/ovi/OviState';
import { TabBar, type TabKey } from '@/components/TabBar';
import { TabBarVisibilityProvider, useTabBarVisibility } from '@/components/TabBarVisibility';

// Route files require a default export — expo-router discovers layouts this way.
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  // Float the FAB above the floating tab bar and the home-indicator inset. The FAB
  // keeps this fixed offset — it does NOT chase the bar as it hides/shows.
  const fabBottom = layout.tabBarHeight + insets.bottom + spacing.s3;
  // Ovi's chat sheet overlays every tab, so it lives here alongside the FAB.
  const [oviOpen, setOviOpen] = useState(false);

  return (
    <TabBarVisibilityProvider>
      {/* Ovi's living state is shared: the corner orb reflects what the panel is
          doing (thinking / speaking), so both surfaces breathe as one character. */}
      <OviStateProvider>
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
          <OviFab
            style={[styles.fab, { bottom: fabBottom, right: spacing.s4 }]}
            onPress={() => setOviOpen(true)}
          />
          <OviChat open={oviOpen} onClose={() => setOviOpen(false)} />
        </View>
      </OviStateProvider>
    </TabBarVisibilityProvider>
  );
}

/**
 * Bridges React Navigation's tab-bar props to our controlled {@link TabBar}.
 * The navigator's route names are the {@link TabKey} union, so `active` is the
 * focused route and `onChange` navigates (with a selection tick, Chip-style).
 * Every navigation also re-shows the bar, so a tab left scrolled-down doesn't
 * open with its navigation hidden.
 */
function TabBarAdapter({ state, navigation }: BottomTabBarProps) {
  const active = state.routes[state.index]?.name as TabKey;
  const visibility = useTabBarVisibility();

  // Re-show on every tab change — whatever the entry path (tap, back, deep link),
  // the destination tab opens with its navigation visible, never mid-hidden.
  const show = visibility?.show;
  useEffect(() => {
    show?.();
  }, [active, show]);

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
