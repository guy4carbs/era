import { createEraAuthApi } from '@era/core/auth-api';
import { magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * Browser-side Better Auth client. Client-safe by construction: it holds no
 * secrets and talks to the same-origin /api/auth/* handlers (baseURL '').
 * NEVER import server-only modules (env, storage, db) into this file — it ships
 * to the browser bundle.
 */
export const authClient = createAuthClient({
  baseURL: '',
  plugins: [magicLinkClient()],
});

/**
 * The shared, provider-agnostic auth surface defined by @era/core. UI calls
 * these instead of reaching into the raw better-auth client, so a provider swap
 * never touches component code.
 */
export const eraAuth = createEraAuthApi(authClient);

export const useSession = authClient.useSession;
