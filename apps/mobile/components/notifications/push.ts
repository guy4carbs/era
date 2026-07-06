/**
 * Push-token capture — DORMANT by design.
 *
 * The whole flow is gated behind the user enabling "Push notifications" in
 * Settings; nothing here runs on app launch and we never prompt unasked. When the
 * user opts in, {@link enablePushNotifications} requests OS permission, resolves
 * the Expo push token, and registers it with the server so price-drop pushes can
 * be delivered.
 *
 * Every step degrades to a clean no-op — it must NEVER crash the app:
 *   - Simulator / emulator (`!Device.isDevice`) → `unavailable` (no APNs/FCM).
 *   - No EAS `projectId` in the config → `unavailable`.
 *   - `getExpoPushTokenAsync` throwing (no APNs entitlement / FCM creds wired,
 *     which are EAS/account-gated per Scout's checklist) → `unavailable`.
 *   - Server unreachable / route dormant → `unavailable` (permission still held).
 *   - User declines the OS prompt → `denied`.
 *
 * A `denied` result is the only one that means "can't deliver" — callers revert
 * the toggle for it. `unavailable` is benign: the user's intent is recorded
 * server-side, the token capture is simply dormant until creds exist.
 *
 * Account-gated (user, not Harbor): the APNs key + FCM credentials on EAS and the
 * `expo-notifications` config plugin / entitlement. Until those land, this module
 * resolves `unavailable` on a real device and no token is ever sent.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { registerPushToken, unregisterPushToken, type PushPlatform } from './api';

/**
 * The outcome of an opt-in attempt. `enabled` carries the token that was
 * registered; `denied` means the OS permission was refused (callers revert);
 * `unavailable` means the flow no-opped for a benign reason (simulator, missing
 * creds/projectId, server down) and the preference can stay on, dormant.
 */
export type PushEnableResult =
  | { readonly status: 'enabled'; readonly token: string }
  | { readonly status: 'denied' }
  | { readonly status: 'unavailable' };

/** The EAS project id the token is scoped to — read from the Expo config. */
function resolveProjectId(): string | null {
  const fromExpoConfig = Constants.expoConfig?.extra?.eas?.projectId;
  const fromEasConfig = (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  const id = fromExpoConfig ?? fromEasConfig;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/** This device's push platform, or null on an unsupported target (e.g. web). */
function pushPlatform(): PushPlatform | null {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return null;
}

/**
 * Opt in to price-drop pushes: request permission, resolve the Expo push token,
 * and register it. Wrapped end-to-end so it always resolves a result and never
 * throws — see the module doc for every no-op path.
 */
export async function enablePushNotifications(): Promise<PushEnableResult> {
  try {
    // Simulators/emulators can't receive a push token — nothing to capture.
    if (!Device.isDevice) return { status: 'unavailable' };

    const platform = pushPlatform();
    if (!platform) return { status: 'unavailable' };

    // Ask only if we don't already hold permission and can still ask.
    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      const asked = await Notifications.requestPermissionsAsync();
      granted = asked.granted;
    }
    if (!granted) return { status: 'denied' };

    const projectId = resolveProjectId();
    if (!projectId) return { status: 'unavailable' };

    let token: string;
    try {
      const result = await Notifications.getExpoPushTokenAsync({ projectId });
      token = result.data;
    } catch {
      // No APNs entitlement / FCM creds wired yet (EAS-gated) — stay dormant.
      return { status: 'unavailable' };
    }

    try {
      await registerPushToken(token, platform);
    } catch {
      // Route dormant or server unreachable; permission is held, so this is
      // benign — the token can be re-registered on a later opt-in.
      return { status: 'unavailable' };
    }

    return { status: 'enabled', token };
  } catch {
    // Any unforeseen native/JS error collapses to a no-op — never crash a toggle.
    return { status: 'unavailable' };
  }
}

/**
 * Best-effort unregister when the user turns push off. Resolves the current token
 * and DELETEs it; every failure is swallowed (the preference has already flipped,
 * and a stale token expires server-side anyway).
 */
export async function disablePushNotifications(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const platform = pushPlatform();
    if (!platform) return;
    const projectId = resolveProjectId();
    if (!projectId) return;
    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await unregisterPushToken(token, platform);
  } catch {
    // A failed unregister never surfaces to the user.
  }
}
