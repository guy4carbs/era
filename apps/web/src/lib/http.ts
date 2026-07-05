/**
 * Small HTTP helpers for route handlers.
 *
 * `gone()` exists because Next has no first-class 410. `notFound()` renders the
 * global `not-found.tsx` with a 404 — right for "this never existed / can't be
 * found". But for content that WAS public and is now permanently removed (a
 * deleted public profile, a retired `/styles/{archetype}`), 410 Gone is the
 * correct signal: crawlers drop a 410 URL far faster than a 404 they keep
 * retrying. This is mainly a Layer-3 concern (public profiles), documented and
 * ready ahead of that work.
 *
 * Usage from a Route Handler (`app/**\/route.ts`):
 *
 *   import { gone } from '@/lib/http'; // or the relative path
 *   export async function GET(_req: Request) {
 *     if (profileWasDeleted) return gone();
 *     // …
 *   }
 *
 * A page (server component) cannot set an arbitrary status directly — to serve a
 * true 410 for a removed page, expose it through a colocated `route.ts`, or (for
 * a soft removal) fall back to `notFound()` and accept the 404.
 */

/** A bare `410 Gone` response with a plain-text body. */
export function gone(message = 'Gone'): Response {
  return new Response(message, {
    status: 410,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      // Removed for good — tell crawlers not to keep it cached/indexed.
      'x-robots-tag': 'noindex',
    },
  });
}
