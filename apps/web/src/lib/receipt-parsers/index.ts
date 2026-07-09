/**
 * Receipt-parser registry, keyed by sender domain.
 *
 * {@link selectParser} picks the retailer parser whose domain matches the
 * sender's (exact or registrable-domain — `order@e.zara.com` → the `zara.com`
 * parser), falling back to the {@link genericParser} when none matches.
 * {@link parseReceipt} is the single entry point the route calls: it runs the
 * selected parser and, if a retailer parser found nothing (layout drift), retries
 * with the generic heuristic. Everything is fail-soft — the worst case is `[]`.
 */
import type { ParsedEmail, ReceiptItem, ReceiptParser } from '../email-receipt.ts';
import { asosParser } from './asos.ts';
import { genericParser } from './generic.ts';
import { hmParser } from './hm.ts';
import { nordstromParser } from './nordstrom.ts';
import { uniqloParser } from './uniqlo.ts';
import { zaraParser } from './zara.ts';

/** The retailer parsers, in lookup order. The generic parser is NOT in here — it
 *  is the explicit fallback, reached only when no retailer domain matches. */
export const RETAILER_PARSERS: readonly ReceiptParser[] = [zaraParser, hmParser, uniqloParser, asosParser, nordstromParser];

/** The retailer parser for a sender domain, or the generic fallback. */
export function selectParser(fromDomain: string): ReceiptParser {
  return RETAILER_PARSERS.find((parser) => parser.supports(fromDomain)) ?? genericParser;
}

/** Run one parser without ever throwing. */
function safeParse(parser: ReceiptParser, email: ParsedEmail): ReceiptItem[] {
  try {
    return parser.parse(email);
  } catch {
    return [];
  }
}

/**
 * Parse a receipt email into its line items. Uses the domain-matched parser, then
 * falls back to the generic heuristic when a retailer parser yields nothing. An
 * unrecognized, non-receipt email returns `[]` (never throws).
 */
export function parseReceipt(email: ParsedEmail): ReceiptItem[] {
  const parser = selectParser(email.fromDomain);
  const items = safeParse(parser, email);
  if (items.length > 0 || parser === genericParser) {
    return items;
  }
  return safeParse(genericParser, email);
}
