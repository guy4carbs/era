/**
 * TabScreen — the shared skeleton for a top-level tab.
 *
 * A titled surface (title1) with a centered empty-state line. Respects the top
 * safe-area inset; the bottom is handled by the tab bar, which insets the scene.
 * Colour comes from theme tokens only.
 */
import { spacing, typeRamp } from '@era/tokens';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/lib/theme';

interface TabScreenProps {
  readonly title: string;
  readonly empty: string;
}

export function TabScreen({ title, empty }: TabScreenProps) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <Text
        style={{
          color: colors.text,
          fontSize: typeRamp.title1.pt,
          lineHeight: typeRamp.title1.lineHeight,
          fontWeight: '600',
        }}
      >
        {title}
      </Text>
      <View style={styles.body}>
        <Text
          style={{
            color: colors.secondary,
            fontSize: typeRamp.body.pt,
            lineHeight: typeRamp.body.lineHeight,
            textAlign: 'center',
          }}
        >
          {empty}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: spacing.s6,
    paddingTop: spacing.s8,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing.s16,
  },
});
