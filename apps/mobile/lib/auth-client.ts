/**
 * Era mobile — Better Auth client.
 *
 * Wires a native Better Auth client for Expo. Sessions are persisted in the
 * device keychain/keystore via expo-secure-store, so a signed-in session
 * survives app restarts (the done-criterion for native auth). The `scheme`
 * MUST match the server's trustedOrigins (`era://`) and app.json's `scheme`
 * so OAuth and magic-link deep links resolve back into the app.
 *
 * The UI never talks to this client directly — it consumes the platform-free
 * {@link EraAuthApi} (`eraAuth`) and the shared {@link SessionState} via
 * `useSession`, both defined in @era/core. That keeps screens portable between
 * web and mobile.
 */
import { expoClient } from '@better-auth/expo/client';
import { createEraAuthApi, type UseSession } from '@era/core/auth-api';
import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';
import * as SecureStore from 'expo-secure-store';

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export const authClient = createAuthClient({
  baseURL,
  plugins: [
    expoClient({
      scheme: 'era',
      storagePrefix: 'era',
      storage: SecureStore,
    }),
    magicLinkClient(),
  ],
});

/** Platform-free auth actions (magic link, social, sign out) the UI calls. */
export const eraAuth = createEraAuthApi(authClient);

/**
 * Reactive session hook, adapted to the shared {@link SessionState} shape.
 * Better Auth's user carries `id`; the contract exposes it as `userId`.
 */
export const useSession: UseSession = () => {
  const { data, isPending } = authClient.useSession();
  if (!data) {
    return { data: null, isPending };
  }
  return {
    data: {
      user: {
        userId: data.user.id,
        email: data.user.email,
        name: data.user.name ?? null,
      },
    },
    isPending,
  };
};
