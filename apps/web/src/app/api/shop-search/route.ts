/**
 * Shop product search.
 *
 *   POST /api/shop-search  { q?, category?, brandTier?, minPrice?, maxPrice?, size?, page? }
 *
 * Session-gated, same-origin browse of the product feed. The server picks the
 * provider (offline fixture today; the dormant Sovrn adapter once a real key is
 * configured — see `lib/shop-provider.ts`) and returns one page of results. This
 * is NOT an AI route: no model runs, no `ai_usage` is written, so there is only a
 * light abuse guard (session + same-origin + body cap), never a daily limit. Its
 * closet-aware, metered sibling is `/api/rank-products`.
 *
 * The affiliate key never touches this handler — it lives inside the provider.
 * The same-origin guard, capped body reader, and query validation are shared
 * across the Shop routes via `lib/shop-query.ts`, so the abuse guards and the
 * enum/price rules are audited in one place.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 403 { error: 'forbidden' }        cross-origin POST
 *   - 400 { error: 'invalid' }          body/query failed validation
 *   - 200 ShopSearchResult              { products, page, hasMore }
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requireUser } from '@era/core';

import { auth } from '../../../lib/auth.ts';
import { isSameOrigin, parseShopQuery, readShopBody } from '../../../lib/shop-query.ts';
import { getShopProvider } from '../../../lib/shop-provider.ts';

export async function POST(request: Request): Promise<NextResponse> {
  const sessionResult = await auth.api.getSession({ headers: request.headers });
  const ctx: AuthContext = { userId: sessionResult?.user.id ?? null };

  try {
    requireUser(ctx);
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    throw error;
  }

  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await readShopBody(request);
  if (!body) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const query = parseShopQuery(body);
  if (!query) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const result = await getShopProvider().search(query);
  return NextResponse.json(result, { status: 200 });
}
