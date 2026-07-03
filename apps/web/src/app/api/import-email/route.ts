/**
 * POST /api/import-email  — Phase 2, NOT IMPLEMENTED (returns 501).
 *
 * Planned flow (see CLAUDE.md → Image pipeline → Item import):
 *
 *   raw RFC822 email
 *     → pick a {@link ReceiptParser} from the registry by the sender's domain
 *     → parser.parse(email) yields {@link ReceiptItem}[]
 *     → each item is imported through the SAME url/image pipeline the
 *       /api/import-from-url route uses (fetch productUrl / imageUrl through the
 *       SSRF gate, store to items-raw, run processItemPipeline with source
 *       'link' and the receipt fields as prefill).
 *
 * A per-retailer parser recognizes its own receipt layout, so the registry is
 * keyed by sender domain (e.g. order-update@zara.com → the Zara parser). Ingest
 * transport (a mailbox webhook, an inbound-email provider) is out of scope for
 * this scaffold; the route only fixes the request/response contract and the
 * parser interface. It is session-gated even while stubbed, so wiring the
 * transport later cannot expose an unauthenticated endpoint.
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requireUser } from '@era/core';

import { auth } from '../../../lib/auth.ts';

/** Request body: a single raw email in RFC822 form. */
export interface ReceiptImportRequest {
  readonly rawEmail: string;
}

/** A minimally-parsed email handed to a {@link ReceiptParser}. */
export interface ParsedEmail {
  readonly fromDomain: string;
  readonly subject: string;
  readonly html: string | null;
  readonly text: string | null;
}

/** One purchased line item lifted from a receipt, ready for the import pipeline. */
export interface ReceiptItem {
  readonly name: string;
  readonly brand?: string;
  // Sanitized decimal string (numeric(12,2)-safe), or absent.
  readonly price?: string;
  // 3-letter uppercase ISO code, or absent.
  readonly currency?: string;
  readonly imageUrl?: string;
  readonly productUrl?: string;
}

/**
 * A retailer-specific receipt parser. The registry selects one by sender domain;
 * `parse` turns a recognized receipt email into its line items.
 */
export interface ReceiptParser {
  supports(fromDomain: string): boolean;
  parse(email: ParsedEmail): ReceiptItem[];
}

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

  return NextResponse.json({ error: 'not_implemented', see: '/docs CLAUDE.md Phase 2' }, { status: 501 });
}
