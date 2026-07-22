import { Redirect } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OviLoader } from '@/components/OviLoader';
import { useSession } from '@/lib/auth-client';
import { useTheme } from '@/lib/theme';

// Route files require a default export — expo-router discovers screens this way.
// Entry router: signed-in users land on the tab shell, everyone else on sign-in.
export default function Index() {
  const { colors } = useTheme();
  const { data, isPending } = useSession();

  if (isPending) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.bg }]}>
        <OviLoader variant="page" />
      </SafeAreaView>
    );
  }

  return <Redirect href={data ? '/feed' : '/sign-in'} />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
