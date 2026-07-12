import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { analytics } from '@/lib/analytics';
import { useSession } from '@/lib/auth-client';
import { logInPurchaser, logOutPurchaser } from '@/lib/purchases';
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
        <PurchaserIdentity />
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

/**
 * Binds the RevenueCat purchaser to the auth session: `Purchases.logIn(userId)`
 * once a session resolves so purchases attach to the Era account (and follow it
 * across devices), `logOut()` when it clears on sign-out so the next user on the
 * device never inherits the previous purchaser. Renders nothing. Both calls are
 * no-ops while Era+ is dormant (flag off or a placeholder RC key), so this is
 * inert in Expo Go and in the current build. Kept beside {@link AnalyticsIdentity}
 * so the identity effects sit inside the providers without touching the navigator.
 */
function PurchaserIdentity() {
  const { data } = useSession();
  const boundUserId = useRef<string | null>(null);

  useEffect(() => {
    const userId = data?.user.userId ?? null;
    if (userId) {
      // Re-bind only when the user actually changes, not on every render.
      if (boundUserId.current !== userId) {
        void logInPurchaser(userId);
        boundUserId.current = userId;
      }
    } else if (boundUserId.current !== null) {
      void logOutPurchaser();
      boundUserId.current = null;
    }
  }, [data]);

  return null;
}

/**
 * The navigator plus the session-driven route guard. The signed-in surface — the
 * `(tabs)` group and the top-level authed screens — lives inside a
 * `Stack.Protected` gated on the session, so an unauthenticated user can never
 * reach it: expo-router drops those screens from the tree when the guard is false
 * and routes back to `index`, which redirects to `/sign-in`. `sign-in` is the
 * inverse — hidden once signed in — so an authed user can't sit on it. `index`
 * stays public in both states as the routing anchor.
 *
 * The guard must NOT fire while the session is still loading: on a cold start the
 * session reads pending (looks signed-out for a tick) and flipping the guard then
 * would bounce an authed user to sign-in. So we hold on a themed splash until the
 * session resolves the first time, then keep the navigator mounted across any later
 * transient pending (e.g. a sign-out refetch) so nothing unmounts mid-session.
 */
function ThemedStack() {
  const { colors, resolved } = useTheme();
  const { data, isPending } = useSession();

  // Latch the first resolution: only the initial load holds the splash; later
  // transient `isPending` ticks reuse the last-known session and never unmount.
  const resolvedOnce = useRef(false);
  if (!isPending) {
    resolvedOnce.current = true;
  }

  if (isPending && !resolvedOnce.current) {
    return (
      <SafeAreaView style={[styles.splash, { backgroundColor: colors.bg }]}>
        <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
        <ActivityIndicator color={colors.text} />
      </SafeAreaView>
    );
  }

  const isSignedIn = data !== null;

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
      >
        {/* Public anchor — self-routes to /feed or /sign-in by session. */}
        <Stack.Screen name="index" />

        {/* Authenticated surface — absent from the tree when signed out. */}
        <Stack.Protected guard={isSignedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="add-item" />
          <Stack.Screen name="design-lab" />
          <Stack.Screen name="outfit-canvas" />
          <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
          <Stack.Screen name="quiz" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="worn" />
        </Stack.Protected>

        {/* Sign-in — hidden once authenticated so no one lands back on it. */}
        <Stack.Protected guard={!isSignedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default wrapRoot(RootLayout);
