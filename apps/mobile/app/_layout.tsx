import { motion } from '@era/tokens';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';

import { OviLoader } from '@/components/OviLoader';
import { CollageExportHost } from '@/components/share';
import { analytics } from '@/lib/analytics';
import { authClient, useSession } from '@/lib/auth-client';
import { captureAuthSessionFromUrl } from '@/lib/auth-deeplink';
import { logInPurchaser, logOutPurchaser } from '@/lib/purchases';
import { wrapRoot } from '@/lib/reporting';
import { ThemeProvider, useTheme } from '@/lib/theme';

// Hold the native splash until fonts AND the auth session have both resolved
// (see ThemedStack). Kept at module top so it runs before first paint.
void SplashScreen.preventAutoHideAsync();

// Route files require a default export — expo-router discovers layouts this way.
// Wrapped with the error reporter so uncaught render errors reach Sentry when a
// DSN is configured; a no-op passthrough otherwise (dormant build stays inert).
function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <MagicLinkCapture />
        <AnalyticsIdentity />
        <PurchaserIdentity />
        <CollageExportHost>
          <ThemedStack />
        </CollageExportHost>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * Catches magic-link deep links. The emailed link verifies in the system
 * browser, which then opens `era://?cookie=<session>` — @better-auth/expo's
 * client only harvests that cookie in its social-OAuth path, never from an
 * incoming deep link, so without this the session evaporated and the user
 * landed back on sign-in (observed on device, 2026-07-15). Handles both the
 * warm case (app open → `url` event) and the cold start (`getInitialURL`);
 * `captureAuthSessionFromUrl` no-ops on any URL that isn't a cookie-bearing
 * `era://` link. After storing, it pokes the session store so `useSession`
 * re-reads and the route guard flips to the signed-in surface.
 */
function MagicLinkCapture() {
  useEffect(() => {
    const deps = {
      getItem: (key: string) => SecureStore.getItem(key),
      setItem: (key: string, value: string) => SecureStore.setItem(key, value),
      notifySession: () => {
        // $store.notify is the plugin's own refresh signal; fall back to an
        // explicit session fetch if a future client drops it.
        const store = (authClient as { $store?: { notify?: (signal: string) => void } }).$store;
        if (store?.notify) {
          store.notify('$sessionSignal');
        } else {
          void authClient.getSession();
        }
      },
    };
    void Linking.getInitialURL().then((url) => {
      if (url) {
        captureAuthSessionFromUrl(url, deps);
      }
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      captureAuthSessionFromUrl(url, deps);
    });
    return () => sub.remove();
  }, []);

  return null;
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
 *
 * Fonts are an additional precondition to that first render: the brand faces
 * (Fraunces static instances + Geist) must be loaded before any `<Text>` paints
 * — including the off-screen share cards captured for image export — so we hold
 * the same splash until BOTH fonts are ready AND the session has resolved once,
 * then hide the native splash and mount the navigator. Later transient session
 * pending never unmounts it.
 */
function ThemedStack() {
  const { colors, resolved } = useTheme();
  const { data, isPending } = useSession();

  // Each key MUST match the internal family name of its TTF (the filename stem),
  // which is also the name registered for use in `<Text>` via `role.mobileFamily`
  // / `mobileSansFamily`. RN cannot drive variable-font axes, so these are baked
  // static instances (Fraunces-OviAccent is already italic/opsz 40/SOFT 60).
  /* eslint-disable @typescript-eslint/no-require-imports -- Metro requires static require() literals for bundled assets; useFonts takes module refs, not import paths. */
  const [fontsLoaded, fontError] = useFonts({
    'Geist-Regular': require('../assets/fonts/Geist-Regular.ttf'),
    'Geist-Medium': require('../assets/fonts/Geist-Medium.ttf'),
    'Geist-SemiBold': require('../assets/fonts/Geist-SemiBold.ttf'),
    'Fraunces-LargeTitle': require('../assets/fonts/Fraunces-LargeTitle.ttf'),
    'Fraunces-Title': require('../assets/fonts/Fraunces-Title.ttf'),
    'Fraunces-OviAccent': require('../assets/fonts/Fraunces-OviAccent.ttf'),
  });
  /* eslint-enable @typescript-eslint/no-require-imports */

  // Latch the first resolution: only the initial load holds the splash; later
  // transient `isPending` ticks reuse the last-known session and never unmount.
  const resolvedOnce = useRef(false);
  if (!isPending) {
    resolvedOnce.current = true;
  }

  // Fonts are ready when loaded, or on error (don't strand the user on a bad
  // font file — RN falls back to the system face and the guard below still warns).
  const fontsReady = fontsLoaded || fontError !== null;
  const sessionReady = !isPending || resolvedOnce.current;
  const ready = fontsReady && sessionReady;

  // Hide the native splash once both preconditions are met and the navigator is
  // about to mount underneath. Idempotent — hideAsync no-ops after the first call.
  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return (
      <SafeAreaView style={[styles.splash, { backgroundColor: colors.bg }]}>
        <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
        <OviLoader variant="page" />
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
          // D0.3 grammar: pushed screens cross-fade rather than native-slide, so a
          // push matches the app's fade-and-rise feel (ScreenEntrance adds the 6px
          // rise inside each screen). Capped at the motion ceiling. `modal` screens
          // opt back into the OS sheet presentation below.
          animation: 'fade',
          animationDuration: motion.durations.maxMs,
        }}
      >
        {/* Public anchor — self-routes to /feed or /sign-in by session. */}
        <Stack.Screen name="index" />

        {/* Authenticated surface — absent from the tree when signed out. */}
        <Stack.Protected guard={isSignedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="add-item" />
          <Stack.Screen name="avatar" options={{ presentation: 'modal' }} />
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
