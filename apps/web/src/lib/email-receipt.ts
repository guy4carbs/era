/**
 * Minimal RFC822 / MIME extraction for retailer order-confirmation emails.
 *
 * This is deliberately NOT a general-purpose MIME library. It does just enough to
 * lift the sender domain, subject, and the text/html + text/plain bodies out of a
 * single retailer receipt so a {@link ReceiptParser} can scrape line items. The
 * supported shape is what order-confirmation mail actually uses:
 *
 *   - headers with folded continuation lines (RFC 5322 §2.2.3),
 *   - a single top-level part, OR a `multipart/*` tree (walked recursively) whose
 *     leaves we keep are `text/html` and `text/plain`,
 *   - `Content-Transfer-Encoding` of `quoted-printable`, `base64`, or an identity
 *     encoding (`7bit` / `8bit` / `binary`),
 *   - `charset` of utf-8 (default) or latin-1 / iso-8859-1 (best-effort),
 *   - RFC 2047 encoded-words in the Subject (best-effort B/Q decode).
 *
 * Explicit limits (a real receipt never needs these, and supporting them invites
 * abuse): the raw email is hard-capped at {@link MAX_EMAIL_BYTES}; nested
 * multipart depth is capped; and unknown encodings/charsets fall back to a
 * lossy-but-safe UTF-8 decode rather than throwing. The ONLY throw is
 * {@link EmailParseError} for an oversized or structurally-empty email — the
 * route maps it to a 400.
 */
import { Buffer } from 'node:buffer';

/** Request body: a single raw email in RFC822 form. */
export interface ReceiptImportRequest {
  readonly rawEmail: string;
}

/** A minimally-parsed email handed to a {@link ReceiptParser}. */
export interface ParsedEmail {
  // Lowercased sender domain from the From header (e.g. `e.zara.com`), or ''.
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
 * `parse` turns a recognized receipt email into its line items. A parser MUST
 * fail soft — an unrecognized layout returns `[]`, it never throws.
 */
export interface ReceiptParser {
  supports(fromDomain: string): boolean;
  parse(email: ParsedEmail): ReceiptItem[];
}

/** The raw email could not be parsed (oversized or structurally empty). → 400. */
export class EmailParseError extends Error {
  readonly code: 'too_large' | 'empty';
  constructor(code: 'too_large' | 'empty') {
    super(code);
    this.name = 'EmailParseError';
    this.code = code;
  }
}

/** Hard cap on the raw email: 1MB. Rejected before any work. */
export const MAX_EMAIL_BYTES = 1024 * 1024;

// Guard against pathological nesting / part counts in a hostile multipart tree.
const MAX_MULTIPART_DEPTH = 8;
const MAX_PARTS = 100;

interface Part {
  readonly headers: Map<string, string>;
  readonly body: string; // raw, still-encoded body text
}

/** A parsed `Content-Type` header: the lowercased media type plus its params. */
interface ContentType {
  readonly type: string;
  readonly params: Map<string, string>;
}

/** Normalize CRLF/CR to LF so downstream splitting only deals with `\n`. */
function normalizeNewlines(raw: string): string {
  return raw.replace(/\r\n?/g, '\n');
}

/**
 * Split a raw message (or MIME part) into its header block and body at the first
 * blank line. Header continuation lines (starting with space/tab) are unfolded
 * onto the previous header. Header names are lowercased; the first value wins.
 */
function splitHeadersAndBody(raw: string): { headers: Map<string, string>; body: string } {
  const sep = raw.indexOf('\n\n');
  const headerText = sep === -1 ? raw : raw.slice(0, sep);
  const body = sep === -1 ? '' : raw.slice(sep + 2);

  const headers = new Map<string, string>();
  const unfolded: string[] = [];
  for (const line of headerText.split('\n')) {
    if (line === '') continue;
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += ` ${line.trim()}`;
    } else {
      unfolded.push(line);
    }
  }
  for (const line of unfolded) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (name !== '' && !headers.has(name)) {
      headers.set(name, value);
    }
  }
  return { headers, body };
}

/**
 * Parse a `Content-Type` value into `{ type, params }`. Param values may be
 * quoted; names are lowercased. Missing header → `text/plain` with no params.
 */
function parseContentType(value: string | undefined): ContentType {
  if (value === undefined || value.trim() === '') {
    return { type: 'text/plain', params: new Map() };
  }
  const segments = value.split(';');
  const type = (segments[0] ?? '').trim().toLowerCase();
  const params = new Map<string, string>();
  for (const segment of segments.slice(1)) {
    const eq = segment.indexOf('=');
    if (eq === -1) continue;
    const key = segment.slice(0, eq).trim().toLowerCase();
    let val = segment.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
      val = val.slice(1, -1);
    }
    if (key !== '') params.set(key, val);
  }
  return { type, params };
}

/** Decode a quoted-printable body to bytes (soft line breaks + =XX escapes). */
function decodeQuotedPrintable(input: string): Uint8Array {
  // Drop soft line breaks (`=` at end of line), then decode `=XX` to bytes.
  const collapsed = input.replace(/=\n/g, '');
  const out: number[] = [];
  for (let i = 0; i < collapsed.length; i += 1) {
    const ch = collapsed[i]!;
    if (ch === '=' && i + 2 < collapsed.length) {
      const hex = collapsed.slice(i + 1, i + 3);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        out.push(Number.parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    out.push(ch.charCodeAt(0) & 0xff);
  }
  return Uint8Array.from(out);
}

/** Decode a base64 body to bytes, tolerating embedded whitespace/newlines. */
function decodeBase64(input: string): Uint8Array {
  const cleaned = input.replace(/[^A-Za-z0-9+/=]/g, '');
  return Uint8Array.from(Buffer.from(cleaned, 'base64'));
}

/** Best-effort decode of bytes for a charset we recognize; else lossy UTF-8. */
function decodeBytes(bytes: Uint8Array, charset: string): string {
  const cs = charset.trim().toLowerCase();
  const label = cs === 'latin-1' || cs === 'latin1' || cs === 'iso-8859-1' || cs === 'iso8859-1' ? 'latin1' : cs === '' ? 'utf-8' : cs;
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/** Decode a single part's body to text per its transfer-encoding + charset. */
function decodePartBody(part: Part, contentType: ContentType): string {
  const encoding = (part.headers.get('content-transfer-encoding') ?? '7bit').trim().toLowerCase();
  const charset = contentType.params.get('charset') ?? 'utf-8';
  if (encoding === 'base64') {
    return decodeBytes(decodeBase64(part.body), charset);
  }
  if (encoding === 'quoted-printable') {
    return decodeBytes(decodeQuotedPrintable(part.body), charset);
  }
  // 7bit / 8bit / binary / unknown: the JS string already holds the characters;
  // only re-decode when a non-UTF-8 charset was declared.
  if (charset.trim().toLowerCase().startsWith('utf')) {
    return part.body;
  }
  return decodeBytes(Uint8Array.from(part.body, (c) => c.charCodeAt(0) & 0xff), charset);
}

/** Split a multipart body into its parts using the boundary delimiter. */
function splitMultipart(body: string, boundary: string): Part[] {
  const delimiter = `--${boundary}`;
  const segments = body.split(delimiter);
  const parts: Part[] = [];
  // segments[0] is the preamble; the closing delimiter yields a trailing epilogue
  // segment (often just "--\n") which parses to an empty part and is harmless.
  for (const segment of segments.slice(1)) {
    if (segment.startsWith('--')) break; // closing delimiter → done
    // A part starts after the delimiter's trailing newline.
    const trimmed = segment.replace(/^\n/, '');
    const { headers, body: partBody } = splitHeadersAndBody(trimmed);
    parts.push({ headers, body: partBody });
    if (parts.length >= MAX_PARTS) break;
  }
  return parts;
}

/**
 * Walk a MIME part tree, collecting the first text/html and first text/plain leaf
 * bodies (decoded). Recurses into `multipart/*` containers up to the depth cap.
 */
function collectBodies(part: Part, depth: number, acc: { html: string | null; text: string | null }): void {
  if (depth > MAX_MULTIPART_DEPTH) return;
  const contentType = parseContentType(part.headers.get('content-type'));

  if (contentType.type.startsWith('multipart/')) {
    const boundary = contentType.params.get('boundary');
    if (boundary === undefined || boundary === '') return;
    for (const child of splitMultipart(part.body, boundary)) {
      collectBodies(child, depth + 1, acc);
      if (acc.html !== null && acc.text !== null) return; // both found → stop
    }
    return;
  }

  if (contentType.type === 'text/html' && acc.html === null) {
    acc.html = decodePartBody(part, contentType);
  } else if (contentType.type === 'text/plain' && acc.text === null) {
    acc.text = decodePartBody(part, contentType);
  }
}

/** Lowercased sender domain from a From header value, or '' when absent. */
function extractFromDomain(from: string | undefined): string {
  if (from === undefined) return '';
  // Prefer the address inside angle brackets; else the bare token with an '@'.
  const angle = /<([^>]+)>/.exec(from)?.[1];
  const candidate = angle ?? from;
  const at = candidate.lastIndexOf('@');
  if (at === -1) return '';
  const domain = candidate
    .slice(at + 1)
    .trim()
    .replace(/[>\s].*$/, '')
    .toLowerCase();
  return /^[a-z0-9.-]+$/.test(domain) ? domain : '';
}

const RFC2047_RE = /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g;

/** Best-effort RFC 2047 decode of encoded-words in a header (e.g. Subject). */
function decodeEncodedWords(value: string): string {
  return value.replace(RFC2047_RE, (match, charset: string, enc: string, data: string) => {
    try {
      if (enc.toLowerCase() === 'b') {
        return decodeBytes(decodeBase64(data), charset);
      }
      // Q-encoding: '_' is space, '=XX' is a byte.
      const bytes = decodeQuotedPrintable(data.replace(/_/g, ' '));
      return decodeBytes(bytes, charset);
    } catch {
      return match;
    }
  });
}

/**
 * Parse a raw RFC822 email into a {@link ParsedEmail}.
 * @throws {EmailParseError} `too_large` when the raw email exceeds
 *   {@link MAX_EMAIL_BYTES}, or `empty` when it has no headers at all.
 */
export function parseReceiptEmail(rawEmail: string): ParsedEmail {
  if (Buffer.byteLength(rawEmail, 'utf8') > MAX_EMAIL_BYTES) {
    throw new EmailParseError('too_large');
  }
  const normalized = normalizeNewlines(rawEmail);
  const { headers, body } = splitHeadersAndBody(normalized);
  if (headers.size === 0) {
    throw new EmailParseError('empty');
  }

  const acc: { html: string | null; text: string | null } = { html: null, text: null };
  collectBodies({ headers, body }, 0, acc);

  return {
    fromDomain: extractFromDomain(headers.get('from')),
    subject: decodeEncodedWords(headers.get('subject') ?? ''),
    html: acc.html,
    text: acc.text,
  };
}
