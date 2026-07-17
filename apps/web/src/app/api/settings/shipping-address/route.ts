/**
 * Read / set / delete the caller's ONE saved shipping address — the buyer detail Rye
 * needs to resolve real shipping + tax and place an order.
 *
 *   GET    /api/settings/shipping-address  → { address: ShippingAddress | null }
 *   PUT    /api/settings/shipping-address  { firstName, lastName, phone, address1,
 *            address2?, city, province, postalCode, country }  → { address }
 *   DELETE /api/settings/shipping-address  → { deleted: true }
 *
 * Owner-scoped end to end: `userId` is ALWAYS the session's, never the body. This is
 * PII the user typed, NOT the checkout feature — so it is deliberately NOT gated on
 * `ERA_CHECKOUT_ENABLED` (no 404): a user can manage their address regardless of the
 * flag. Session-gated (401), same-origin on the mutating verbs (403), body-capped +
 * field-validated (400). The DELETE wipes the row; account deletion cascades it away.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 403 { error: 'forbidden' }        cross-origin (PUT/DELETE)
 *   - 400 { error: 'invalid' }          body failed validation
 *   - 200 { address } | { deleted: true }
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requireUser } from '@era/core';
import { type ShippingAddress, createDbClient, shippingAddresses } from '@era/db';
import { eq } from 'drizzle-orm';

import { auth } from '../../../../lib/auth.ts';
import { isSameOrigin } from '../../../../lib/shop-query.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** An address is small; cap it well below anything a real form needs. */
const MAX_BODY_BYTES = 4 * 1024;
/** Bound each free-text field so a hostile client can't stuff the row. */
const MAX_FIELD_CHARS = 200;

interface ParsedAddress {
  readonly firstName: string;
  readonly lastName: string;
  // Optional end to end — the form marks it "(optional)", the vendor treats it
  // optional, and the column is nullable. Only included in the buyer payload when
  // present. (A specific retailer that requires phone would surface as a Rye offer
  // error at sandbox time — a launch consideration, not a stored-data requirement.)
  readonly phone: string | null;
  readonly address1: string;
  readonly address2: string | null;
  readonly city: string;
  readonly province: string;
  readonly postalCode: string;
  readonly country: string;
}

/** Resolve the caller's id, or a 401. */
async function authenticate(request: Request): Promise<{ userId: string } | NextResponse> {
  const sessionResult = await auth.api.getSession({ headers: request.headers });
  const ctx: AuthContext = { userId: sessionResult?.user.id ?? null };
  try {
    return { userId: requireUser(ctx) };
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    throw error;
  }
}

/** Read the capped JSON object body, or null (→ 400). */
async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return null;
  }
  const rawBody = await request.text().catch(() => '');
  if (rawBody.length > MAX_BODY_BYTES) {
    return null;
  }
  let body: unknown;
  try {
    body = rawBody.length > 0 ? JSON.parse(rawBody) : {};
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  return body as Record<string, unknown>;
}

/** A bounded non-empty trimmed string, or null. */
function boundedNonEmpty(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_FIELD_CHARS) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Validate the address body, or null (→ 400). Every required field must be a bounded
 * non-empty string; `country` must be a 2-letter ISO-3166 alpha-2 code (normalized to
 * uppercase); `address2` is optional (absent/blank → null).
 *
 * Each field is parsed into its own const so a single null-check narrows them all to
 * `string` — the base tsconfig's `noUncheckedIndexedAccess` makes a `Record` lookup
 * `string | undefined`, which would not satisfy the required-string fields below.
 */
function parseAddress(body: Record<string, unknown>): ParsedAddress | null {
  const firstName = boundedNonEmpty(body.firstName);
  const lastName = boundedNonEmpty(body.lastName);
  const address1 = boundedNonEmpty(body.address1);
  const city = boundedNonEmpty(body.city);
  const province = boundedNonEmpty(body.province);
  const postalCode = boundedNonEmpty(body.postalCode);
  if (
    firstName === null ||
    lastName === null ||
    address1 === null ||
    city === null ||
    province === null ||
    postalCode === null
  ) {
    return null;
  }

  // Phone is optional (nullable column, optional at the vendor). Reject a present
  // but malformed value; a blank/absent value is a legitimate null.
  let phone: string | null = null;
  if (body.phone !== undefined && body.phone !== null) {
    if (typeof body.phone !== 'string' || body.phone.length > MAX_FIELD_CHARS) {
      return null;
    }
    const trimmed = body.phone.trim();
    phone = trimmed.length > 0 ? trimmed : null;
  }

  const countryRaw = boundedNonEmpty(body.country);
  if (countryRaw === null || !/^[A-Za-z]{2}$/.test(countryRaw)) {
    return null;
  }

  let address2: string | null = null;
  if (body.address2 !== undefined && body.address2 !== null) {
    if (typeof body.address2 !== 'string' || body.address2.length > MAX_FIELD_CHARS) {
      return null;
    }
    const trimmed = body.address2.trim();
    address2 = trimmed.length > 0 ? trimmed : null;
  }

  return {
    firstName,
    lastName,
    phone,
    address1,
    address2,
    city,
    province,
    postalCode,
    country: countryRaw.toUpperCase(),
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  const authed = await authenticate(request);
  if (authed instanceof NextResponse) {
    return authed;
  }
  const [address] = await db.select().from(shippingAddresses).where(eq(shippingAddresses.userId, authed.userId)).limit(1);
  return NextResponse.json({ address: (address as ShippingAddress | undefined) ?? null }, { status: 200 });
}

export async function PUT(request: Request): Promise<NextResponse> {
  const authed = await authenticate(request);
  if (authed instanceof NextResponse) {
    return authed;
  }
  const { userId } = authed;

  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await readBody(request);
  if (!body) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const parsed = parseAddress(body);
  if (!parsed) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  await db
    .insert(shippingAddresses)
    .values({ userId, ...parsed })
    .onConflictDoUpdate({
      target: shippingAddresses.userId,
      set: { ...parsed, updatedAt: new Date() },
    });

  const [address] = await db.select().from(shippingAddresses).where(eq(shippingAddresses.userId, userId)).limit(1);
  return NextResponse.json({ address: (address as ShippingAddress | undefined) ?? null }, { status: 200 });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const authed = await authenticate(request);
  if (authed instanceof NextResponse) {
    return authed;
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  await db.delete(shippingAddresses).where(eq(shippingAddresses.userId, authed.userId));
  return NextResponse.json({ deleted: true }, { status: 200 });
}
