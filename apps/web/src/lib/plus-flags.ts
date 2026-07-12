/**
 * Era+ CLIENT feature flag — the cosmetic half of the Era+ gate.
 *
 * `NEXT_PUBLIC_ERA_PLUS_ENABLED` is inlined into the browser bundle and decides
 * only whether the Settings entry point is even rendered. It is COSMETIC: it must
 * never be the sole gate on anything that matters, because anyone can read a
 * client bundle. The real lock is the SERVER half — `isPlusEnabledServer` in
 * `plus-server.ts`, which delegates to `@era/core`'s canonical `isEraPlusEnabled`
 * and gates the `/plus` route and the `/api/plus/*` handlers. That reader sits
 * beside DB access, so it can't be imported into a client component; this
 * client-safe module is its counterpart for client code.
 *
 * In normal operation the pair moves together. The split only lets the UI go dark
 * independently of the server (e.g. hide the entry point while a direct link stays
 * reachable for a smoke test), never the reverse.
 */

/**
 * Cosmetic client gate. `true` only when `NEXT_PUBLIC_ERA_PLUS_ENABLED === 'true'`.
 * Safe in client components — Next inlines this at build. Never rely on it alone
 * to protect anything; it only decides whether to *show* an entry point.
 */
export function isPlusEnabledClient(): boolean {
  return process.env.NEXT_PUBLIC_ERA_PLUS_ENABLED === 'true';
}
