/**
 * SSRF-safe URL fetching for the import-from-url flow.
 *
 * A user hands us an arbitrary URL and we fetch it server-side, so every request
 * is a potential SSRF vector into the private network or the cloud metadata
 * endpoint. These helpers are the ONLY sanctioned way to fetch a user-supplied
 * URL: they force https, reject embedded credentials and non-443 ports, resolve
 * the hostname and require EVERY resolved address to be public, and re-validate
 * each redirect hop through the same gate.
 *
 * Known limitation (Phase-2 hardening): validation resolves DNS, then fetch()
 * resolves it again, so a DNS-rebinding attacker could return a public address
 * to the guard and a private one to the fetch. Node's global fetch (undici) does
 * not expose a connect hook to pin the validated address without a new
 * dependency. This blocks the common cases (private hostnames, literal private
 * IPs, metadata hosts, non-https, credential/port smuggling); pinning the
 * resolved IP at connect time is a follow-up.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** The URL failed an SSRF guard. Callers must surface a generic 403 — never the message. */
export class BlockedUrlError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'BlockedUrlError';
  }
}

/** A network-level fetch failure (DNS, timeout, transport, redirect abuse). Maps to 502. */
export class FetchError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'FetchError';
  }
}

const MAX_REDIRECTS = 3;

// A normal desktop Chrome UA. Retailers gate scrapers on the User-Agent, so a
// realistic string is required to reach the product markup at all.
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// Hostnames that never resolve to a public host. Checked before DNS.
const BLOCKED_HOSTNAME = /(^localhost$)|(\.local$)|(\.internal$)/i;

/** True for any IPv4 address in a private, loopback, link-local, or reserved range. */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true; // malformed → treat as unsafe
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false;
}

type Hextets = [number, number, number, number, number, number, number, number];

/**
 * Expand an IPv6 literal to its 8 hextets, resolving `::` compression and an
 * optional embedded IPv4 dotted tail (`::ffff:1.2.3.4`). Returns null for
 * anything that is not a well-formed IPv6 address. Input must already be
 * lowercased with any zone id stripped.
 */
function expandIPv6(addr: string): Hextets | null {
  let text = addr;

  // Fold an embedded IPv4 dotted tail into two hex groups so the rest of the
  // parse only ever deals with hextets.
  const dot = text.indexOf('.');
  if (dot !== -1) {
    const colon = text.lastIndexOf(':', dot);
    if (colon === -1) return null;
    const octets = text.slice(colon + 1).split('.');
    if (octets.length !== 4) return null;
    const n: number[] = [];
    for (const octet of octets) {
      if (!/^\d{1,3}$/.test(octet)) return null;
      const value = Number(octet);
      if (value > 255) return null;
      n.push(value);
    }
    const hi = ((n[0]! << 8) | n[1]!).toString(16);
    const lo = ((n[2]! << 8) | n[3]!).toString(16);
    text = `${text.slice(0, colon + 1)}${hi}:${lo}`;
  }

  const parseGroups = (part: string): number[] | null => {
    if (part === '') return [];
    const groups: number[] = [];
    for (const group of part.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
      groups.push(Number.parseInt(group, 16));
    }
    return groups;
  };

  const halves = text.split('::');
  if (halves.length > 2) return null; // more than one '::' is invalid

  let full: number[];
  if (halves.length === 2) {
    const left = parseGroups(halves[0]!);
    const right = parseGroups(halves[1]!);
    if (left === null || right === null) return null;
    const gap = 8 - left.length - right.length;
    if (gap < 0) return null;
    full = [...left, ...new Array<number>(gap).fill(0), ...right];
  } else {
    const groups = parseGroups(text);
    if (groups === null) return null;
    full = groups;
  }

  if (full.length !== 8) return null;
  return full as Hextets;
}

/**
 * True for any IPv6 loopback, unspecified, link-local, or unique-local address,
 * OR an IPv4-mapped / IPv4-translated / NAT64-embedded address whose embedded
 * IPv4 is private. The WHATWG URL parser normalizes `::ffff:169.254.169.254` to
 * the HEX form `::ffff:a9fe:a9fe`, so a dotted-only regex is bypassable — the
 * embed check runs on the fully-expanded hextets instead.
 */
export function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().split('%')[0] ?? ''; // strip any zone id
  if (addr === '::1' || addr === '::') return true; // loopback / unspecified
  if (addr.startsWith('fe8') || addr.startsWith('fe9') || addr.startsWith('fea') || addr.startsWith('feb')) {
    return true; // fe80::/10 link-local
  }
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // fc00::/7 unique-local

  const h = expandIPv6(addr);
  if (h === null) return true; // unparseable → treat as unsafe

  // IPv4-mapped ::ffff:0:0/96 and IPv4-translated ::ffff:0:0:0/96 both carry the
  // IPv4 in the low 32 bits — reconstruct it and defer to the v4 classifier so a
  // mapped *public* host (::ffff:8.8.8.8) still passes.
  const embeddedIPv4 = `${h[6] >> 8}.${h[6] & 0xff}.${h[7] >> 8}.${h[7] & 0xff}`;
  if (h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0) {
    if (h[4] === 0 && h[5] === 0xffff) return isPrivateIPv4(embeddedIPv4); // ::ffff:0:0/96
    if (h[4] === 0xffff && h[5] === 0) return isPrivateIPv4(embeddedIPv4); // ::ffff:0:0:0/96
  }

  // NAT64 well-known 64:ff9b::/96 and local-use 64:ff9b:1::/48 wrap an arbitrary
  // (often private) IPv4; nothing we originate should target them — reject the
  // whole space.
  if (h[0] === 0x64 && h[1] === 0xff9b) {
    if (h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0) return true; // 64:ff9b::/96
    if (h[2] === 0x0001) return true; // 64:ff9b:1::/48 local-use
  }

  return false;
}

/** True when `ip` is not a routable public address (or is not a valid IP at all). */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true; // not a parseable IP → unsafe
}

/**
 * Validate a user-supplied URL against every SSRF guard and return the parsed
 * URL. Resolves DNS and requires ALL addresses to be public.
 * @throws {BlockedUrlError} on any guard failure.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError('invalid_url');
  }
  if (url.protocol !== 'https:') {
    throw new BlockedUrlError('protocol');
  }
  if (url.username !== '' || url.password !== '') {
    throw new BlockedUrlError('credentials');
  }
  if (url.port !== '' && url.port !== '443') {
    throw new BlockedUrlError('port');
  }

  const hostname = url.hostname.replace(/^\[/, '').replace(/\]$/, ''); // unwrap IPv6 literal
  if (hostname === 'localhost' || BLOCKED_HOSTNAME.test(url.hostname)) {
    throw new BlockedUrlError('hostname');
  }

  // Literal IP host: validate the literal directly (no DNS).
  if (isIP(hostname) !== 0) {
    if (isPrivateAddress(hostname)) {
      throw new BlockedUrlError('private_ip');
    }
    return url;
  }

  // Hostname: resolve and require EVERY address to be public.
  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new BlockedUrlError('dns');
  }
  if (addresses.length === 0) {
    throw new BlockedUrlError('dns');
  }
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new BlockedUrlError('private_ip');
    }
  }
  return url;
}

export interface SafeFetchResult {
  readonly response: Response;
  // The URL of the final (non-redirect) response, for resolving relative links.
  readonly finalUrl: URL;
}

/**
 * Fetch a user-supplied URL with the full SSRF gate: https-only, redirects
 * followed manually (≤ MAX_REDIRECTS) and re-validated on every hop, one
 * wall-clock timeout across the whole chain. The caller still owns response
 * status / content-type checks and MUST cap the body read.
 * @throws {BlockedUrlError} when the URL or any redirect target fails a guard.
 * @throws {FetchError} on transport failure, timeout, or redirect abuse.
 */
export async function safeFetch(
  initialUrl: string,
  opts: { accept: string; timeoutMs: number; maxRedirects?: number },
): Promise<SafeFetchResult> {
  const signal = AbortSignal.timeout(opts.timeoutMs);
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;

  let current = await assertPublicUrl(initialUrl);
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    let response: Response;
    try {
      response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal,
        headers: { Accept: opts.accept, 'User-Agent': DESKTOP_UA },
      });
    } catch {
      throw new FetchError('fetch_failed');
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      response.body?.cancel().catch(() => {});
      if (!location) {
        throw new FetchError('bad_redirect');
      }
      if (hop === maxRedirects) {
        throw new FetchError('too_many_redirects');
      }
      let next: URL;
      try {
        next = new URL(location, current); // resolve relative redirects
      } catch {
        throw new FetchError('bad_redirect');
      }
      current = await assertPublicUrl(next.toString()); // RE-VALIDATE every hop
      continue;
    }

    return { response, finalUrl: current };
  }
  throw new FetchError('too_many_redirects');
}

/**
 * Stream a response body into memory with a hard byte cap, aborting the read the
 * moment it is exceeded so an oversized (or unbounded) body cannot exhaust
 * memory.
 * @throws {FetchError} `too_large` when the body exceeds `maxBytes`.
 */
export async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) {
    return new Uint8Array(0);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        throw new FetchError('too_large');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof FetchError) {
      throw error;
    }
    throw new FetchError('read_failed');
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

// --- Product metadata extraction -------------------------------------------
//
// String/regex parsing only — NO new dependency. A real HTML/DOM parser (e.g.
// cheerio) would be more robust against malformed markup and is a Phase-2
// nicety; today's targets (major retailers) ship well-formed JSON-LD / OG tags.

/** Scraped product metadata. All fields best-effort; imageUrl gates the import. */
export interface ProductMeta {
  readonly name?: string;
  readonly brand?: string;
  readonly imageUrl?: string;
  // Sanitized decimal string (numeric(12,2)-safe), or absent.
  readonly price?: string;
  // 3-letter uppercase ISO code, or absent.
  readonly currency?: string;
}

// Match caps mirror the pipeline's stored-text caps so prefill can't store
// unbounded scraped text.
const META_NAME_MAX = 120;
const META_BRAND_MAX = 64;

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  '#x27': "'",
  nbsp: ' ',
};

// Decode the small set of HTML entities that show up in meta content attributes,
// plus numeric (decimal/hex) character references.
function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z0-9]+);/gi, (match: string, entity: string) => {
    const key = entity.toLowerCase();
    const named = HTML_ENTITIES[key];
    if (named !== undefined) {
      return named;
    }
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

// Collapse a raw price string to a numeric(12,2)-safe decimal, or null. Strips
// currency symbols, thousands separators, and stray text; rejects non-finite,
// negative, or absurdly large values.
function sanitizePrice(raw: unknown): string | null {
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw : '';
  const cleaned = text.replace(/[^0-9.]/g, '');
  if (cleaned === '' || cleaned === '.') {
    return null;
  }
  // Keep the first dot only, drop the rest (handles "1.234.56" style noise).
  const firstDot = cleaned.indexOf('.');
  const normalized = firstDot === -1 ? cleaned : `${cleaned.slice(0, firstDot)}.${cleaned.slice(firstDot + 1).replace(/\./g, '')}`;
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value < 0 || value >= 1e10) {
    return null;
  }
  return value.toFixed(2);
}

// A 3-letter uppercase ISO 4217 code, or null.
function sanitizeCurrency(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const code = raw.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstString(entry);
      if (found !== undefined) {
        return found;
      }
    }
  }
  // schema.org often nests images/brands as { url } / { name } objects.
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.url === 'string') return record.url;
    if (typeof record.name === 'string') return record.name;
  }
  return undefined;
}

// Flatten schema.org JSON-LD (arrays, @graph) into a flat node list.
function flattenJsonLd(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const entry of node) {
      flattenJsonLd(entry, out);
    }
    return;
  }
  if (node !== null && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    out.push(record);
    if ('@graph' in record) {
      flattenJsonLd(record['@graph'], out);
    }
  }
}

function hasType(node: Record<string, unknown>, type: string): boolean {
  const t = node['@type'];
  return t === type || (Array.isArray(t) && t.includes(type));
}

// Pull {name, brand, imageUrl, price, currency} from the first schema.org
// Product node across all JSON-LD blocks.
function fromJsonLd(html: string): ProductMeta {
  const blockRe = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const nodes: Record<string, unknown>[] = [];
  for (const match of html.matchAll(blockRe)) {
    try {
      flattenJsonLd(JSON.parse((match[1] ?? '').trim()), nodes);
    } catch {
      // Ignore malformed JSON-LD blocks; other blocks / OG tags may still work.
    }
  }
  const product = nodes.find((node) => hasType(node, 'Product'));
  if (!product) {
    return {};
  }
  const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers;
  const offer = offers !== null && typeof offers === 'object' ? (offers as Record<string, unknown>) : {};
  return {
    name: firstString(product.name),
    brand: firstString(product.brand),
    imageUrl: firstString(product.image),
    price: sanitizePrice(offer.price ?? offer.lowPrice) ?? undefined,
    currency: sanitizeCurrency(offer.priceCurrency) ?? undefined,
  };
}

// Parse <meta> property/name → content into a lookup (first value wins).
function metaTags(html: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (key !== undefined && content !== undefined && !map.has(key)) {
      map.set(key, decodeEntities(content));
    }
  }
  return map;
}

/**
 * Extract product metadata from HTML with precedence JSON-LD > OpenGraph >
 * fallback (twitter:image / <title>). brand falls back to og:site_name. Name
 * and brand are entity-decoded and length-capped; price/currency are sanitized.
 */
export function extractProductMeta(html: string): ProductMeta {
  const jsonLd = fromJsonLd(html);
  const tags = metaTags(html);
  const titleText = decodeEntities(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? '');

  const rawName = jsonLd.name ?? tags.get('og:title') ?? (titleText.length > 0 ? titleText : undefined);
  const rawBrand = jsonLd.brand ?? tags.get('og:site_name');
  const imageUrl =
    jsonLd.imageUrl ?? tags.get('og:image:secure_url') ?? tags.get('og:image') ?? tags.get('twitter:image');
  const price = jsonLd.price ?? sanitizePrice(tags.get('product:price:amount') ?? tags.get('og:price:amount')) ?? undefined;
  const currency =
    jsonLd.currency ?? sanitizeCurrency(tags.get('product:price:currency') ?? tags.get('og:price:currency')) ?? undefined;

  const meta: { -readonly [K in keyof ProductMeta]: ProductMeta[K] } = {};
  if (rawName !== undefined && rawName.length > 0) meta.name = rawName.slice(0, META_NAME_MAX);
  if (rawBrand !== undefined && rawBrand.length > 0) meta.brand = rawBrand.slice(0, META_BRAND_MAX);
  if (imageUrl !== undefined && imageUrl.length > 0) meta.imageUrl = imageUrl;
  if (price !== undefined) meta.price = price;
  if (currency !== undefined) meta.currency = currency;
  return meta;
}

/**
 * Map a fetched image content-type to a safe upload {ext, contentType} in the
 * R2 allowlist (jpg/png/webp/avif), normalizing image/jpg → image/jpeg. Returns
 * null for anything else so the caller can 422.
 */
export function imageUploadTarget(contentType: string): { ext: string; contentType: string } | null {
  const type = (contentType.split(';')[0] ?? '').trim().toLowerCase();
  switch (type) {
    case 'image/jpeg':
    case 'image/jpg':
      return { ext: 'jpg', contentType: 'image/jpeg' };
    case 'image/png':
      return { ext: 'png', contentType: 'image/png' };
    case 'image/webp':
      return { ext: 'webp', contentType: 'image/webp' };
    case 'image/avif':
      return { ext: 'avif', contentType: 'image/avif' };
    default:
      return null;
  }
}
