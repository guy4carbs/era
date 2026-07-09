/**
 * Block-based receipt-parser factory shared by the per-retailer parsers.
 *
 * Order-confirmation emails render line items as a repeated block (a table row or
 * a card). A retailer config supplies the block delimiter plus how to find the
 * product name (and, for marketplaces, a per-item brand) inside one block; the
 * factory handles the rest — price, currency, image, and product URL come from
 * the shared {@link html} helpers. Every produced parser fails soft: an
 * unrecognized layout, a missing name, or any thrown error yields `[]`.
 */
import type { ParsedEmail, ReceiptItem, ReceiptParser } from '../email-receipt.ts';
import { capBrand, capName, firstImageUrl, firstProductUrl, firstText, parsePrice, toText } from './html.ts';

/** Hard cap on line items lifted from a single receipt (mirrors the route cap). */
export const MAX_ITEMS_PER_RECEIPT = 25;

export interface RetailerConfig {
  readonly domains: readonly string[];
  // Fixed brand for a single-brand retailer (Zara, H&M…). Omit for marketplaces.
  readonly brandDefault?: string;
  // Splits the item region into per-item blocks (global regex, capture group 1 =
  // the block HTML).
  readonly blockRe: RegExp;
  // Captures the product name inside one block (group 1).
  readonly nameRe: RegExp;
  // Captures a per-item brand inside one block (group 1), for marketplaces.
  readonly brandRe?: RegExp;
  // Captures the price substring inside one block (group 1); falls back to the
  // whole block's text when omitted.
  readonly priceRe?: RegExp;
}

function matchesDomain(domains: readonly string[], fromDomain: string): boolean {
  return domains.some((d) => fromDomain === d || fromDomain.endsWith(`.${d}`));
}

function blockToItem(block: string, config: RetailerConfig): ReceiptItem | null {
  const name = firstText(block, new RegExp(config.nameRe.source, config.nameRe.flags.replace('g', '')));
  if (name === undefined) return null;

  const priceSource = config.priceRe ? (firstText(block, new RegExp(config.priceRe.source, config.priceRe.flags.replace('g', ''))) ?? '') : toText(block);
  const { price, currency } = parsePrice(priceSource);

  const brand = config.brandRe
    ? firstText(block, new RegExp(config.brandRe.source, config.brandRe.flags.replace('g', ''))) ?? config.brandDefault
    : config.brandDefault;

  const item: { -readonly [K in keyof ReceiptItem]: ReceiptItem[K] } = { name: capName(name) };
  if (brand !== undefined) item.brand = capBrand(brand);
  if (price !== undefined) item.price = price;
  if (currency !== undefined) item.currency = currency;
  const imageUrl = firstImageUrl(block);
  if (imageUrl !== undefined) item.imageUrl = imageUrl;
  const productUrl = firstProductUrl(block);
  if (productUrl !== undefined) item.productUrl = productUrl;
  return item;
}

/** Build a {@link ReceiptParser} from a retailer's block layout config. */
export function makeRetailerParser(config: RetailerConfig): ReceiptParser {
  return {
    supports: (fromDomain: string) => matchesDomain(config.domains, fromDomain),
    parse: (email: ParsedEmail): ReceiptItem[] => {
      const html = email.html;
      if (html === null || html === '') return [];
      try {
        const items: ReceiptItem[] = [];
        const blockRe = new RegExp(config.blockRe.source, config.blockRe.flags.includes('g') ? config.blockRe.flags : `${config.blockRe.flags}g`);
        for (const match of html.matchAll(blockRe)) {
          const block = match[1];
          if (block === undefined) continue;
          const item = blockToItem(block, config);
          if (item !== null) items.push(item);
          if (items.length >= MAX_ITEMS_PER_RECEIPT) break;
        }
        return items;
      } catch {
        return [];
      }
    },
  };
}
