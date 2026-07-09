/**
 * Client-side decision logic for the receipt-import view (paste a forwarded order
 * email → draft items). Pure and dependency-free (no React, no strings, no
 * network) so the byte cap and the result-copy branch are unit-testable under the
 * node test runner exactly like the lib logic the routes lean on.
 *
 * The view itself (ReceiptImport.tsx) owns the JSX and maps the outcome kind
 * returned here onto `strings.closet.importReceipt.*`; this module never touches
 * copy so the two stay decoupled.
 */

/**
 * Client cap for the pasted raw email, mirroring the server's `MAX_EMAIL_BYTES`
 * (1MB) so we reject an oversized paste before the round-trip (the route answers
 * 400 for the same condition). Measured in UTF-8 bytes, matching how the server
 * sizes `rawEmail`.
 */
export const MAX_RAW_EMAIL_BYTES = 1_000_000;

/** UTF-8 byte length of the pasted text (what the server measures, not char count). */
export function rawEmailByteLength(raw: string): number {
  return new TextEncoder().encode(raw).length;
}

/** True while the paste is within the 1MB server cap. Empty input is trivially within. */
export function isEmailWithinCap(raw: string): boolean {
  return rawEmailByteLength(raw) <= MAX_RAW_EMAIL_BYTES;
}

/** One imported draft item as the route returns it. */
export interface ImportedReceiptItem {
  readonly id: string;
  readonly name: string;
  readonly category: string;
}

/** The 200 body of POST /api/import-email. */
export interface ReceiptImportResult {
  readonly imported: ImportedReceiptItem[];
  readonly skipped: number;
}

/**
 * What the result screen should say, decoupled from copy: `added` when at least
 * one draft landed (headline is the count), `empty` when none did (an
 * unrecognized retailer or a receipt we couldn't read — honest, points at the
 * photo/link paths). The route can't distinguish "unsupported store" from
 * "recognized but empty" (both are `imported: []`), so both fold into `empty`.
 */
export type ReceiptOutcome = { kind: 'added'; count: number } | { kind: 'empty' };

export function receiptOutcome(result: ReceiptImportResult): ReceiptOutcome {
  const count = Array.isArray(result.imported) ? result.imported.length : 0;
  return count > 0 ? { kind: 'added', count } : { kind: 'empty' };
}

/**
 * Narrow an unknown 200 body to the import result, or null when it isn't the
 * expected shape (a defensive parse so a malformed body degrades to the error
 * state rather than throwing in render).
 */
export function parseReceiptResult(body: unknown): ReceiptImportResult | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;
  if (!Array.isArray(record.imported)) return null;
  const imported: ImportedReceiptItem[] = [];
  for (const entry of record.imported) {
    if (typeof entry !== 'object' || entry === null) return null;
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.category !== 'string') {
      return null;
    }
    imported.push({ id: item.id, name: item.name, category: item.category });
  }
  const skipped = typeof record.skipped === 'number' ? record.skipped : 0;
  return { imported, skipped };
}
