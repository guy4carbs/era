import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { analytics } from '@/lib/analytics';
import { useSession } from '@/lib/auth-client';
import { wrapRoot } from '@/lib/reporting';
import { ThemeProvider, useTheme } from '@/lib/theme';

// Route files require a default export — expo-router discovers layouts this way.
// Wrapped with the error reporter so uncaught render errors reach Sentry when a
// DSN is configured; a no-op passthrough otherwise (dormant build stays inert).
function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AnalyticsIdentity />
        <ThemedStack />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * Binds analytics identity to the auth session: `identify(userId)` once a session
 * resolves, `reset()` when it clears on sign-out. Renders nothing. Kept as its own
 * component so the identity effect sits inside the providers without touching the
 * navigator.
 */
function AnalyticsIdentity() {
  const { data } = useSession();
  const identified = useRef<string | null>(null);

  useEffect(() => {
    const userId = data?.user.userId ?? null;
    if (userId) {
      // Re-identify only when the user actually changes, not on every render.
      if (identified.current !== userId) {
        analytics.identify(userId);
        identified.current = userId;
      }
    } else if (identified.current !== null) {
      // Session cleared — drop identity so later anonymous events aren't bound.
      analytics.reset();
      identified.current = null;
    }
  }, [data]);

  return null;
}

function ThemedStack() {
  const { colors, resolved } = useTheme();
  return (
    <>
      <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
        }}
      />
    </>
  );
}

export default wrapRoot(RootLayout);
