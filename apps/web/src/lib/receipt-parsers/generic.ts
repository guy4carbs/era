/**
 * Generic fallback parser for order-confirmation emails from retailers we have no
 * bespoke parser for. It is heuristic and low-precision by design — it looks for
 * money amounts that carry a currency marker (a bare number is ignored so a
 * quantity isn't mistaken for a price), then lifts a nearby product name, image,
 * and link from the surrounding markup. Amounts sitting next to totals/shipping/
 * tax wording are skipped. Anything it cannot confidently turn into a
 * `{ name, price }` pair is dropped, and any thrown error yields `[]`.
 *
 * `supports()` returns true for every domain: the registry only ever reaches the
 * generic parser after no retailer parser matched (or a retailer parser returned
 * nothing), so it is the catch-all, not a competitor.
 */
import type { ParsedEmail, ReceiptItem, ReceiptParser } from '../email-receipt.ts';
import { MAX_SCAN_BYTES, capName, decodeEntities, firstImageUrl, firstProductUrl, parsePrice, toText } from './html.ts';

const MAX_GENERIC_ITEMS = 25;

// Totals suppression measures its window in TEXT space, not raw HTML: strip the
// tags from a generous raw slice, then test only the tail of the resulting text.
// Heavy inline CSS wedged between a "Total" label and its amount blows past any
// raw-char window, but collapses to a single space once tags are stripped — so
// the label lands right next to the amount as it reads. RAW_SLICE is sized to
// survive that CSS padding; the TEXT window preserves the original precision
// intent (a totals word IMMEDIATELY preceding the amount, not paragraphs away).
const TOTALS_RAW_SLICE = 400;
const TOTALS_TEXT_WINDOW = 80;

// A money amount that MUST carry a currency symbol or a 3-letter ISO code — this
// is what separates a price from a stray quantity in unknown markup.
const MONEY_RE =
  /(?:[$£€¥₩₹]\s?[0-9][0-9.,]*[0-9])|(?:[0-9][0-9.,]*[0-9]\s?(?:[$£€¥₩₹]|\b(?:USD|EUR|GBP|JPY|CAD|AUD|CHF|SEK|NOK|DKK|PLN|KRW|CNY|INR|HKD|SGD|NZD)\b))/g;

// Amounts LABELED by one of these words are order math (subtotal/shipping/tax),
// not a line item. Multilingual because EU receipts are a supported case:
// en (total/shipping/tax/vat), de (Versand/Lieferung/Gesamt/Summe/MwSt),
// fr (Livraison/TVA/frais de port; "Total"/"Sous-total" caught by `total`),
// es (Envío/IVA; "Totale"/"Subtotal" caught by `total`), it (Spedizione/IVA).
// `total` already substring-matches Totale/Total TTC/Sous-total; `summe` matches
// Zwischensumme; `gesamt` matches Gesamtbetrag.
const TOTAL_WORDS =
  /(sub-?total|total|shipping|delivery|\btax\b|\bvat\b|discount|order summary|you (?:saved|save)|estimated|versand|lieferung|gesamt|summe|mwst|livraison|\btva\b|env[íi]o|spedizione|\biva\b|frais de port)/i;

/** Text of the last `<a>…</a>` in a chunk, or undefined. */
function lastAnchorText(chunk: string): string | undefined {
  const matches = [...chunk.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)];
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const text = toText(matches[i]?.[1] ?? '');
    if (text.length >= 2 && !/^https?:/i.test(text)) return text;
  }
  return undefined;
}

/** `alt` of the last `<img>` in a chunk, or undefined. */
function lastImageAlt(chunk: string): string | undefined {
  const alts = [...chunk.matchAll(/<img\b[^>]*\balt\s*=\s*["']([^"']+)["'][^>]*>/gi)];
  const last = alts[alts.length - 1]?.[1];
  if (last === undefined) return undefined;
  const text = decodeEntities(last).trim();
  return text.length >= 2 ? text : undefined;
}

function parseHtml(html: string): ReceiptItem[] {
  const items: ReceiptItem[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(MONEY_RE)) {
    if (match.index === undefined) continue;
    // The product name/image/link precede the price in these layouts, so look
    // only at the window BEFORE the amount — looking forward would grab the NEXT
    // item's anchor.
    const before = html.slice(Math.max(0, match.index - 600), match.index);
    // Suppress order-math amounts (subtotal/shipping/tax) only when a totals word
    // sits BEFORE the amount it labels ("Shipping $5.00"). Backward-only is
    // deliberate: a forward window would swallow a real last item whose price is
    // immediately followed by a "Total"/"Versand" row in compact markup. The
    // window is measured in TEXT space (see TOTALS_*), so style-heavy retailer
    // markup — inline CSS between the label and the amount — cannot push the
    // totals word out of range the way a raw-HTML window let it.
    const precedingText = toText(html.slice(Math.max(0, match.index - TOTALS_RAW_SLICE), match.index));
    if (TOTAL_WORDS.test(precedingText.slice(-TOTALS_TEXT_WINDOW))) continue;

    const { price, currency } = parsePrice(match[0]);
    if (price === undefined) continue;

    const name = lastAnchorText(before) ?? lastImageAlt(before);
    if (name === undefined) continue;

    const key = `${name.toLowerCase()}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const item: { -readonly [K in keyof ReceiptItem]: ReceiptItem[K] } = { name: capName(name), price };
    if (currency !== undefined) item.currency = currency;
    const imageUrl = firstImageUrl(before);
    if (imageUrl !== undefined) item.imageUrl = imageUrl;
    const productUrl = firstProductUrl(before);
    if (productUrl !== undefined) item.productUrl = productUrl;
    items.push(item);
    if (items.length >= MAX_GENERIC_ITEMS) break;
  }
  return items;
}

function parseText(text: string): ReceiptItem[] {
  const items: ReceiptItem[] = [];
  const seen = new Set<string>();

  for (const line of text.split('\n')) {
    const match = MONEY_RE.exec(line);
    MONEY_RE.lastIndex = 0; // reset the shared global regex between lines
    if (!match) continue;
    if (TOTAL_WORDS.test(line)) continue;

    const { price, currency } = parsePrice(match[0]);
    if (price === undefined) continue;

    const name = line.slice(0, match.index).replace(/[\s.\-–—:]+$/, '').trim();
    if (name.length < 2) continue;

    const key = `${name.toLowerCase()}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const item: { -readonly [K in keyof ReceiptItem]: ReceiptItem[K] } = { name: capName(name), price };
    if (currency !== undefined) item.currency = currency;
    items.push(item);
    if (items.length >= MAX_GENERIC_ITEMS) break;
  }
  return items;
}

export const genericParser: ReceiptParser = {
  supports: () => true,
  parse: (email: ParsedEmail): ReceiptItem[] => {
    try {
      if (email.html !== null && email.html !== '') {
        // Cap the scanned region — the anchor/img `[\s\S]*?` matchers on this
        // attacker-supplied body carry the same O(n²) risk as the retailer blocks.
        const html = email.html.length > MAX_SCAN_BYTES ? email.html.slice(0, MAX_SCAN_BYTES) : email.html;
        const fromHtml = parseHtml(html);
        if (fromHtml.length > 0) return fromHtml;
      }
      if (email.text !== null && email.text !== '') {
        return parseText(email.text);
      }
      return [];
    } catch {
      return [];
    }
  },
};
