/**
 * POST /api/import-email  { rawEmail: string }
 *
 * Import wardrobe items from a retailer order-confirmation email. The raw RFC822
 * message is parsed (headers + text/html + text/plain) by lib/email-receipt.ts,
 * then a {@link ReceiptParser} chosen by the sender's domain lifts the line items
 * (lib/receipt-parsers/). The lifted items are imported by the shared server core
 * (lib/receipt-import-server.ts) — the SAME url/image pipeline as the forwarded-
 * receipt webhook and /api/import-from-url — so every item lands as a DRAFT
 * (`tagsConfirmed: false`) for the confirm screen.
 *
 * This route owns only the PASTE transport: the client hands us one raw email per
 * call. Session-gated + same-origin + body-capped, mirroring the other mutating
 * routes. The ingest transport for FORWARDED receipts is the separate inbound
 * webhook; both converge on {@link importReceiptItems}.
 *
 * AI cost: an item whose image runs the vision/bg pipeline is live AI spend, so it
 * is gated + metered exactly like /api/process-item — the global AI brake and the
 * per-user `process-item` daily limit form a budget for the whole receipt. Once the
 * budget is spent the remaining items degrade to image-less drafts (no AI) rather
 * than 429-ing the whole receipt.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }   no session
 *   - 403 { error: 'forbidden' }         cross-origin request
 *   - 400 { error: 'invalid' }           missing/blank/oversized/malformed email
 *   - 200 { imported: [{ id, name, category }], skipped: number }
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requireUser } from '@era/core';

import { auth } from '../../../lib/auth.ts';
import { EmailParseError, MAX_EMAIL_BYTES, type ReceiptItem, parseReceiptEmail } from '../../../lib/email-receipt.ts';
import { parseReceipt } from '../../../lib/receipt-parsers/index.ts';
import { importReceiptItems } from '../../../lib/receipt-import-server.ts';
import { isSameOrigin } from '../../../lib/shop-query.ts';

// Re-export the request/parser contract so the route file remains the documented
// home of the import-email types even though they are defined in the lib.
export type { ParsedEmail, ReceiptImportRequest, ReceiptItem, ReceiptParser } from '../../../lib/email-receipt.ts';

// The request envelope wraps a ≤1MB rawEmail; JSON-escaping can inflate it, so
// cap the read generously — the 1MB rawEmail cap is enforced by parseReceiptEmail.
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** Read the capped JSON body, or null (→ 400) on any failure. */
async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return null;
  }
  const rawBody = await request.text().catch(() => '');
  if (rawBody.length === 0 || rawBody.length > MAX_BODY_BYTES) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(rawBody);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const sessionResult = await auth.api.getSession({ headers: request.headers });
  const ctx: AuthContext = { userId: sessionResult?.user.id ?? null };

  let userId: string;
  try {
    userId = requireUser(ctx);
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    throw error;
  }

  // Mutating POST: reject a cross-origin caller (mirrors the other write routes).
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await readBody(request);
  const rawEmail = body?.rawEmail;
  if (typeof rawEmail !== 'string' || rawEmail.length === 0 || rawEmail.length > MAX_EMAIL_BYTES) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  // Parse the email and lift its line items. A malformed/oversized email is a 400;
  // a well-formed but unrecognized (non-receipt) email yields [] → imported: [].
  let receiptItems: ReceiptItem[];
  try {
    const email = parseReceiptEmail(rawEmail);
    receiptItems = parseReceipt(email);
  } catch (error) {
    if (error instanceof EmailParseError) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }
    throw error;
  }

  const { imported, skipped } = await importReceiptItems({ userId, ctx, items: receiptItems });
  return NextResponse.json({ imported, skipped });
}
