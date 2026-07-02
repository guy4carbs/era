import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const cream = '#F7F3EC';
const ink = '#141210';

// Route files require a default export — expo-router discovers layouts this way.
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: cream },
          headerStyle: { backgroundColor: cream },
          headerTintColor: ink,
        }}
      />
    </SafeAreaProvider>
  );
}
