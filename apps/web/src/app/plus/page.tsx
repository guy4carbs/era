import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { strings } from '@era/core/strings';

import { auth } from '../../lib/auth';
import { getPlusDisplayPrices, getPlusState, isPlusEnabledServer } from '../../lib/plus-server';
import { PlusScreen } from './PlusScreen';

export const metadata: Metadata = {
  title: `${strings.plus.paywallTitle} — Era`,
  description: strings.plus.paywallSubtitle,
  // Authed, transactional surface — never index it (robots.ts also disallows /plus).
  robots: { index: false, follow: false },
};

/**
 * Render at REQUEST time, never at build time (same lesson as sitemap.ts).
 * The dormancy gate below runs BEFORE any dynamic API, so a build made while
 * `ERA_PLUS_ENABLED` is off would otherwise bake `notFound()` into a static,
 * long-cached 404 — and flipping the flag via env alone (no rebuild) could
 * never bring the page up. Observed in prod on the first flag flip.
 */
export const dynamic = 'force-dynamic';

/** The status a Stripe redirect can hand back on `/plus?status=…`. */
type Status = 'success' | 'canceled';

function parseStatus(value: string | string[] | undefined): Status | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'success' || raw === 'canceled' ? raw : null;
}

/**
 * `/plus` — the Era+ paywall and plan-management surface. A standalone authed
 * screen (a sibling of `/settings`, outside the tab shell) because Era+ is an
 * account-level concern, not one of the four product tabs.
 *
 * Three gates, in order:
 * 1. **Session** — no session redirects to sign-in, matching `/settings`. A
 *    momentary auth hiccup is treated as signed-out rather than 500ing.
 * 2. **Server flag** — `ERA_PLUS_ENABLED` is authoritative. When it's off the
 *    route does not exist: `notFound()`. The client `NEXT_PUBLIC_` flag only ever
 *    decides whether the Settings entry point is shown; it can't reach this page.
 * 3. **Subscription state** — `getPlusState` decides which face renders: the calm
 *    "you're in" management state for a subscriber, or the plan cards otherwise.
 */
export default async function PlusPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Authoritative gate first — an off flag means the route simply isn't here.
  if (!isPlusEnabledServer()) {
    notFound();
  }

  const requestHeaders = await headers();

  let session: Awaited<ReturnType<typeof auth.api.getSession>> = null;
  try {
    session = await auth.api.getSession({ headers: requestHeaders });
  } catch {
    session = null;
  }
  if (!session) {
    redirect('/sign-in');
  }

  const plusState = await getPlusState({ headers: requestHeaders });
  const status = parseStatus((await searchParams).status);

  // Display prices are Stripe-sourced and cached server-side (see
  // getPlusDisplayPrices) — null renders the cards honestly price-free, which is
  // also the dormant-Stripe state. No dollar amount ever lives in copy.
  const prices = await getPlusDisplayPrices();

  return <PlusScreen isPlus={plusState.isPlus} status={status} prices={prices ?? undefined} />;
}
