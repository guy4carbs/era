/**
 * Client-side decision logic for the bulk (flat-lay) capture flow: classify the
 * POST /api/process-batch response into the UI state to show, and compute the
 * changed-only patch for a per-item confirm. Pure and dependency-free (no React,
 * no strings, no network) so every branch of the state machine is unit-testable
 * under the node test runner, mirroring how the route's own orchestration is
 * tested in flatlay-batch.test.ts.
 *
 * BulkCapture.tsx owns the JSX and maps each outcome `kind` onto copy
 * (`strings.closet.bulkCapture.*`, `strings.ovi.*`); this module never imports
 * copy so the contract and the wording stay decoupled.
 */

/** One segmented item as the route returns it (already persisted, unconfirmed). */
export interface BatchItem {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly imageUrl: string | null;
}

/** The 200 body of POST /api/process-batch. */
export interface BatchResponseBody {
  readonly items: BatchItem[];
  readonly failed: number;
  readonly reason?: 'segmentation_unavailable' | 'no_items_found';
}

/**
 * The UI state a process-batch response maps to:
 *   - confirm      → items came back; show the batch confirm screen (failed count
 *                    drives the partial-failure line)
 *   - dormant      → empty + segmentation_unavailable (vision credential off) —
 *                    the warm "switching this on" beat, not an error
 *   - no_items     → empty + no_items_found — retry guidance (more space between pieces)
 *   - daily_limit  → 429 — the per-user daily add cap; message from the body
 *   - ai_paused    → 503 — the global AI brake; a gentle back-shortly beat
 *   - error        → 413/502/400/401/403/other — a generic honest failure + retry
 */
export type BatchOutcome =
  | { kind: 'confirm'; items: BatchItem[]; failed: number }
  | { kind: 'dormant' }
  | { kind: 'no_items' }
  | { kind: 'daily_limit'; message: string | null }
  | { kind: 'ai_paused' }
  | { kind: 'error' };

/** Best-effort read of the daily-limit message the route sends (else null). */
function readMessage(body: unknown): string | null {
  if (typeof body === 'object' && body !== null) {
    const message = (body as Record<string, unknown>).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return null;
}

/** Narrow an unknown 200 body to the batch shape, tolerating a missing failed count. */
function parseBatchBody(body: unknown): BatchResponseBody | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;
  if (!Array.isArray(record.items)) return null;
  const items: BatchItem[] = [];
  for (const entry of record.items) {
    if (typeof entry !== 'object' || entry === null) return null;
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.category !== 'string') {
      return null;
    }
    items.push({
      id: item.id,
      name: item.name,
      category: item.category,
      imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : null,
    });
  }
  const failed = typeof record.failed === 'number' ? record.failed : 0;
  const reason =
    record.reason === 'segmentation_unavailable' || record.reason === 'no_items_found' ? record.reason : undefined;
  return { items, failed, reason };
}

/**
 * Map an HTTP status + parsed body to the UI outcome. The non-200 branches come
 * first (they carry no batch body); a 200 with items is a confirm, and a 200 with
 * an empty list splits on `reason` (dormant vs no-items), defaulting an unknown
 * empty to the retry-guidance path.
 */
export function classifyBatchResponse(status: number, body: unknown): BatchOutcome {
  if (status === 429) return { kind: 'daily_limit', message: readMessage(body) };
  if (status === 503) return { kind: 'ai_paused' };
  if (status !== 200) return { kind: 'error' };

  const parsed = parseBatchBody(body);
  if (parsed === null) return { kind: 'error' };
  if (parsed.items.length > 0) return { kind: 'confirm', items: parsed.items, failed: parsed.failed };
  if (parsed.reason === 'segmentation_unavailable') return { kind: 'dormant' };
  return { kind: 'no_items' };
}

/** The changed-only fields for a per-item confirm PATCH ({ updates }). */
export interface BatchItemEdit {
  name?: string;
  category?: string;
}

/**
 * Diff an item's edited name/category against what the route created, returning
 * only what actually changed — the same changed-only patch idiom ConfirmItem
 * uses. An emptied name is dropped (the column is NOT NULL; the route rejects a
 * blank name), so a cleared field is a no-op rather than an invalid write.
 */
export function batchItemEdits(
  original: { name: string; category: string },
  next: { name: string; category: string },
): BatchItemEdit {
  const edit: BatchItemEdit = {};
  const trimmedName = next.name.trim();
  if (trimmedName.length > 0 && trimmedName !== original.name) {
    edit.name = trimmedName;
  }
  if (next.category !== original.category) {
    edit.category = next.category;
  }
  return edit;
}
