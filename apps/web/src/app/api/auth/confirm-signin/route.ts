/**
 * The human's confirm POST for the magic-link interstitial.
 *
 * The confirm page (`/sign-in/confirm`) posts the validated `next` (Better
 * Auth's verify URL) here when the person taps "Sign in to Era". We RE-VALIDATE
 * `next` — same-origin + exact verify path — and only then 303-redirect the
 * browser to it. That GET on the verify endpoint consumes the single-use token
 * and sets the session; the interstitial has kept a link-prefetcher from ever
 * reaching this POST.
 *
 * The re-validation here is the load-bearing open-redirect guard: never trust
 * that the page already checked `next`. An invalid `next` is a 400, never a
 * redirect.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { validateMagicLinkNext } from '../../../../lib/magic-link-confirm.ts';
import { siteUrl } from '../../../../lib/site-url.ts';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData();
  const next = form.get('next');

  const safeNext = validateMagicLinkNext(
    typeof next === 'string' ? next : undefined,
    new URL(siteUrl()).origin,
  );

  if (!safeNext) {
    return new NextResponse('Invalid sign-in link.', { status: 400 });
  }

  // 303 → the browser follows with a GET, which is what the verify endpoint
  // expects. The token is consumed and the session set on that hop.
  return NextResponse.redirect(safeNext, 303);
}
