/**
 * Dependency-free HTML + price helpers shared by the receipt parsers.
 *
 * String/regex parsing only — no DOM library (mirrors the choice in
 * lib/url-import.ts). Everything here is pure and fail-soft: a malformed block
 * yields empty fields, never a throw. The price parser is the interesting part —
 * retailer receipts mix US (`$1,234.56`) and European (`1.234,56 €`) grouping, so
 * `parsePrice` disambiguates the decimal separator by position and detects the
 * currency from a symbol or a 3-letter ISO code.
 */

const NAME_MAX = 120;
const BRAND_MAX = 64;

/**
 * Upper bound on how much HTML the block/money regexes ever scan. The
 * `<tag …>([\s\S]*?)</tag>` block matchers degrade to O(n²) on a body full of
 * unclosed opening tags (benchmarked ~4s at 1MB — a DoS vector on an
 * attacker-supplied email), so callers slice the body to this size before
 * matchAll. A real order-confirmation's item region is a few KB; 256KB is far
 * beyond any legitimate receipt while capping the worst case to milliseconds.
 */
export const MAX_SCAN_BYTES = 256 * 1024;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  '#x27': "'",
  nbsp: ' ',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  ccedil: 'ç',
  ouml: 'ö',
  uuml: 'ü',
  auml: 'ä',
};

/** Decode the small set of HTML entities that appear in receipt markup. */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z0-9]+);/gi, (match: string, entity: string) => {
    const key = entity.toLowerCase();
    const named = NAMED_ENTITIES[key];
    if (named !== undefined) return named;
    if (key.startsWith('#x')) {
      const code = Number.parseInt(key.slice(2), 16);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    if (key.startsWith('#')) {
      const code = Number.parseInt(key.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return match;
  });
}

/** Strip tags, decode entities, and collapse whitespace to a single-line string. */
export function toText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** First capture group of `re` against `html`, as cleaned text, or undefined. */
export function firstText(html: string, re: RegExp): string | undefined {
  const raw = re.exec(html)?.[1];
  if (raw === undefined) return undefined;
  const text = toText(raw);
  return text.length > 0 ? text : undefined;
}

// Currency symbols → ISO 4217. `$` defaults to USD (the common receipt case).
const SYMBOL_TO_ISO: Record<string, string> = {
  '$': 'USD',
  '£': 'GBP',
  '€': 'EUR',
  '¥': 'JPY',
  '₩': 'KRW',
  '₹': 'INR',
};

const KNOWN_ISO = new Set([
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CAD',
  'AUD',
  'CHF',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'KRW',
  'CNY',
  'INR',
  'HKD',
  'SGD',
  'NZD',
]);

// A monetary token: an optional symbol/code, then a number with grouping. Kept
// permissive on the number and normalized by `normalizeAmount`.
const PRICE_RE = /(?:([$£€¥₩₹])|\b([A-Z]{3})\b)?\s*([0-9][0-9.,]*[0-9]|[0-9])\s*(?:([$£€¥₩₹])|\b([A-Z]{3})\b)?/;

/**
 * Disambiguate grouping and normalize a numeric token to a `numeric(12,2)`-safe
 * decimal string, or null. When both `.` and `,` occur, the LAST one is the
 * decimal separator; when only one occurs, a trailing 2-digit group is treated as
 * a decimal, otherwise as thousands grouping.
 */
function normalizeAmount(token: string): string | null {
  const s = token.replace(/[^0-9.,]/g, '');
  if (s === '') return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  let normalized: string;
  if (lastComma !== -1 && lastDot !== -1) {
    const decSep = lastComma > lastDot ? ',' : '.';
    const thouSep = decSep === ',' ? '.' : ',';
    normalized = s.split(thouSep).join('').replace(decSep, '.');
  } else if (lastComma !== -1) {
    const parts = s.split(',');
    const last = parts[parts.length - 1] ?? '';
    normalized = parts.length === 2 && last.length === 2 ? `${parts[0] ?? ''}.${last}` : parts.join('');
  } else if (lastDot !== -1) {
    const parts = s.split('.');
    const last = parts[parts.length - 1] ?? '';
    // A single dot with 1-2 trailing digits is a decimal (`45.5`, `45.00`);
    // anything else (3-digit tail, multiple dots) is thousands grouping.
    normalized = parts.length === 2 && last.length <= 2 ? s : parts.join('');
  } else {
    normalized = s;
  }

  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value < 0 || value >= 1e10) return null;
  return value.toFixed(2);
}

export interface ParsedPrice {
  readonly price?: string;
  readonly currency?: string;
}

/**
 * Extract the first price + currency from a string. Currency comes from an
 * explicit 3-letter ISO code if present, else a leading/trailing symbol.
 */
export function parsePrice(raw: string): ParsedPrice {
  const match = PRICE_RE.exec(raw);
  if (!match) return {};
  const [, symBefore, isoBefore, number, symAfter, isoAfter] = match;
  const price = normalizeAmount(number ?? '');
  if (price === null) return {};

  const iso = [isoBefore, isoAfter].find((c) => c !== undefined && KNOWN_ISO.has(c));
  const symbol = symBefore ?? symAfter;
  const currency = iso ?? (symbol !== undefined ? SYMBOL_TO_ISO[symbol] : undefined);

  return currency !== undefined ? { price, currency } : { price };
}

// Spacer / tracking pixels we never want as an item image.
const SPACER_RE = /(spacer|pixel|tracking|1x1|clear\.gif|transparent)/i;

/** First non-spacer `<img src>` (https only) inside a block, or undefined. */
export function firstImageUrl(block: string): string | undefined {
  for (const tag of block.match(/<img\b[^>]*>/gi) ?? []) {
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (src === undefined) continue;
    if (SPACER_RE.test(src) || SPACER_RE.test(tag)) continue;
    if (!/^https:\/\//i.test(src)) continue;
    return src;
  }
  return undefined;
}

/** First https `<a href>` inside a block, skipping obvious non-product links. */
export function firstProductUrl(block: string): string | undefined {
  for (const tag of block.match(/<a\b[^>]*>/gi) ?? []) {
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (href === undefined) continue;
    if (!/^https:\/\//i.test(href)) continue;
    if (/(unsubscribe|mailto:|\/account|\/help|privacy|terms)/i.test(href)) continue;
    return decodeEntities(href);
  }
  return undefined;
}

export interface RawItemFields {
  readonly name: string;
  readonly brand?: string;
  readonly price?: string;
  readonly currency?: string;
  readonly imageUrl?: string;
  readonly productUrl?: string;
}

/** Cap and clean a name/brand string. */
export function capName(value: string): string {
  return value.slice(0, NAME_MAX);
}

export function capBrand(value: string): string {
  return value.slice(0, BRAND_MAX);
}
