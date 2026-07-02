/**
 * Better Auth's catch-all HTTP handler. Every `/api/auth/*` request — magic
 * link, social callbacks, session, sign-out — is served by Better Auth itself
 * via this single route. `toNextJsHandler` returns the GET/POST pair Next.js
 * expects; we simply re-export them.
 */
import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '../../../../lib/auth.ts';

export const { GET, POST } = toNextJsHandler(auth);
