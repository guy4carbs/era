import { spacing } from '@era/tokens';
import { strings } from '@era/core/strings';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { TabScreen } from '@/components/TabScreen';

// Route files require a default export — expo-router discovers screens this way.
export default function DesignScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <TabScreen title="Design" empty={strings.outfits.emptyDesign} />
      <View style={styles.cta} pointerEvents="box-none">
        <Button label="Take the style quiz" onPress={() => router.push('/quiz')} haptic />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Pinned above the tab bar (the scene is already inset by it).
  cta: {
    position: 'absolute',
    left: spacing.s6,
    right: spacing.s6,
    bottom: spacing.s6,
  },
});
