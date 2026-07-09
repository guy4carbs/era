'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { Button } from '../Button';
import { BulkCapture } from './BulkCapture';
import { ConfirmItem } from './ConfirmItem';
import { PhotoPicker } from './PhotoPicker';
import { ReceiptImport } from './ReceiptImport';
import { StatusPulse } from './StatusPulse';
import { downscaleToJpeg } from './downscale';
import { trackFirstOnce } from '../../lib/analytics';
import { useSession } from '../../lib/auth-client';
import type { Item, ItemEdits, ItemWithDisplay, Processed } from './types';

export interface AddItemFlowProps {
  /** When set, skip the picker and resume at confirm for this existing item. */
  resumeItemId?: string | null;
}

type Stage =
  | 'picker'
  | 'loading'
  | 'uploading'
  | 'processing'
  | 'importing'
  | 'confirm'
  | 'saved'
  | 'error'
  // The two additional capture paths, each a self-contained sub-flow rendered in
  // place of the picker (own internal steps; the top Cancel still exits to closet).
  | 'receipt'
  | 'bulk';

/** Which stage failed — drives what the retry action re-runs. */
type FailedStage = 'load' | 'upload' | 'process' | 'confirm';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

const screenStyle: CSSProperties = {
  minHeight: '100dvh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  paddingInline: 'var(--space-4)',
  paddingBlock: 'var(--space-8)',
};

const columnStyle: CSSProperties = {
  width: '100%',
  maxWidth: 'var(--feed-col)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
};

const topRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  minHeight: 'var(--touch-target-min)',
};

const cancelStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--color-secondary-strong)',
  fontSize: typeRamp.footnote.rem,
  fontWeight: 600,
  minHeight: 'var(--touch-target-min)',
  paddingInline: 'var(--space-2)',
};

const statusColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-3)',
  paddingBlock: 'var(--space-16)',
  textAlign: 'center',
};

const errorTextStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-text)',
};

/** Inline failure line shown above the picker when a link import comes back empty. */
const linkErrorStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-rust)',
};

/**
 * On a resume we lack the process result, so infer whether vision produced tags
 * from AI-derived fields the placeholder path never sets (mirrors mobile).
 */
function inferVision(item: ItemWithDisplay): boolean {
  return Boolean(item.colorPrimary || item.pattern || item.brand);
}

/**
 * The add-item state machine: picker → uploading → processing → confirm → saved,
 * with a per-stage error state that retries only the failed step. The picked
 * photo is downscaled client-side, uploaded to a signed URL, then processed by
 * the AI pipeline; the confirm screen is where the user checks the tags. When
 * `resumeItemId` is set we jump straight to confirm for an existing, unconfirmed
 * item (the closet's "tap to confirm" path).
 */
export function AddItemFlow({ resumeItemId = null }: AddItemFlowProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [stage, setStage] = useState<Stage>(resumeItemId ? 'loading' : 'picker');
  const [confirmData, setConfirmData] = useState<{ item: ItemWithDisplay; processed: Processed } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [failedStage, setFailedStage] = useState<FailedStage | null>(null);
  // Set from a 429 daily-limit response so the error state speaks the limit line
  // instead of the generic "couldn't add" copy (a retry wouldn't help).
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  // The pasted product URL (lifted so a failed import can be retried) and the
  // one-line failure notice shown above the picker after an empty import.
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  // Retained across retries so a failed step can resume without redoing prior work.
  const fileRef = useRef<File | null>(null);
  const rawKeyRef = useRef<string | null>(null);
  const lastEditsRef = useRef<ItemEdits>({});

  /** GET the closet and resolve one item's signed display URL. */
  async function fetchItemWithDisplay(id: string): Promise<ItemWithDisplay | null> {
    const res = await fetch('/api/items');
    if (!res.ok) throw new Error('items fetch failed');
    const body = (await res.json()) as { items: ItemWithDisplay[] };
    return body.items.find((it) => it.id === id) ?? null;
  }

  /**
   * Best-effort first-item funnel signal. GETs the closet and fires
   * `first_item_added` only when the confirmed item is the sole (non-archived)
   * piece — i.e. the count transitioned to 1 — deduped once per user. Any
   * transport failure is swallowed; a missed signal must never affect the add.
   */
  async function maybeTrackFirstItem(category: string): Promise<void> {
    try {
      const res = await fetch('/api/items');
      if (!res.ok) return;
      const body = (await res.json()) as { items: ItemWithDisplay[] };
      if (body.items.length === 1) {
        trackFirstOnce('first_item_added', session?.user?.id, { category });
      }
    } catch {
      // Analytics is best-effort — never surface to the add flow.
    }
  }

  async function runProcess() {
    setStage('processing');
    setLimitMessage(null);
    try {
      const res = await fetch('/api/process-item', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ rawKey: rawKeyRef.current }),
      });
      // Daily AI limit — surface Ovi's warm message, no retry (it would re-hit it).
      if (res.status === 429) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setLimitMessage(body.message ?? strings.closet.addFailed);
        setFailedStage(null);
        setStage('error');
        return;
      }
      if (!res.ok) throw new Error('process failed');
      const { item, processed } = (await res.json()) as { item: Item; processed: Processed };
      const withDisplay = (await fetchItemWithDisplay(item.id)) ?? { ...item, displayUrl: null };
      setConfirmData({ item: withDisplay, processed });
      setStage('confirm');
    } catch {
      setFailedStage('process');
      setStage('error');
    }
  }

  async function runUpload() {
    setStage('uploading');
    try {
      const blob = await downscaleToJpeg(fileRef.current as File);
      const signRes = await fetch('/api/upload-url', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ ext: 'jpg', contentType: 'image/jpeg' }),
      });
      if (!signRes.ok) throw new Error('sign failed');
      const { url, key } = (await signRes.json()) as { url: string; key: string };
      const putRes = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob,
      });
      if (!putRes.ok) throw new Error('put failed');
      rawKeyRef.current = key;
      await runProcess();
    } catch {
      setFailedStage('upload');
      setStage('error');
    }
  }

  async function runLoad(id: string) {
    setStage('loading');
    try {
      const found = await fetchItemWithDisplay(id);
      if (!found) throw new Error('item not found');
      // Resume: we lack the original process result, so infer whether vision
      // landed tags from the row itself (mirrors mobile's inferVision). An item
      // that only carries placeholder tags reads as the manual path, not processed.
      setConfirmData({
        item: found,
        processed: { bg: Boolean(found.imageCutoutPath), vision: inferVision(found) },
      });
      setStage('confirm');
    } catch {
      setFailedStage('load');
      setStage('error');
    }
  }

  /**
   * Import a piece from a pasted product URL. The server fetches the page,
   * pulls an image + fields, and returns the same {item, processed} shape the
   * photo path produces, so we resolve the display URL and land on the exact
   * same confirm screen. A failure keeps the photo path reachable: we return to
   * the picker with a one-line notice above it, the URL retained for a retry.
   */
  async function runImport(url: string) {
    setLinkError(null);
    setStage('importing');
    try {
      const res = await fetch('/api/import-from-url', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error('import failed');
      const { item, processed } = (await res.json()) as { item: Item; processed: Processed };
      const withDisplay = (await fetchItemWithDisplay(item.id)) ?? { ...item, displayUrl: null };
      setConfirmData({ item: withDisplay, processed });
      setStage('confirm');
    } catch {
      setLinkError(strings.closet.linkFailed);
      setStage('picker');
    }
  }

  async function runConfirm(edits: ItemEdits) {
    if (!confirmData) return;
    lastEditsRef.current = edits;
    setSaving(true);
    try {
      const body: { updates?: ItemEdits; confirm: boolean } = { confirm: true };
      if (Object.keys(edits).length > 0) body.updates = edits;
      const res = await fetch(`/api/items/${confirmData.item.id}`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('confirm failed');
      // First-item activation: fire only when this confirm made the closet go
      // from empty to one item, and at most once per user (guarded in the helper).
      void maybeTrackFirstItem(confirmData.item.category);
      setStage('saved');
      router.push('/closet');
    } catch {
      setSaving(false);
      setFailedStage('confirm');
      setStage('error');
    }
  }

  function handlePick(file: File) {
    fileRef.current = file;
    void runUpload();
  }

  function handleLink(url: string) {
    setLinkUrl(url);
    void runImport(url);
  }

  // The two additional capture paths. Each is a self-contained sub-flow; entering
  // one clears any stale link-import notice so it doesn't linger on return.
  function handleReceipt() {
    setLinkError(null);
    setStage('receipt');
  }

  function handleBulk() {
    setLinkError(null);
    setStage('bulk');
  }

  function handleRetry() {
    switch (failedStage) {
      case 'load':
        if (resumeItemId) void runLoad(resumeItemId);
        break;
      case 'upload':
        void runUpload();
        break;
      case 'process':
        void runProcess();
        break;
      case 'confirm':
        void runConfirm(lastEditsRef.current);
        break;
    }
  }

  // Resume mode: load the item straight into confirm on mount.
  useEffect(() => {
    if (resumeItemId) void runLoad(resumeItemId);
  }, [resumeItemId]);

  const showCancel =
    stage === 'picker' ||
    stage === 'confirm' ||
    stage === 'error' ||
    stage === 'receipt' ||
    stage === 'bulk';

  return (
    <main style={screenStyle}>
      <div style={columnStyle}>
        <div style={topRowStyle}>
          {showCancel ? (
            <button type="button" style={cancelStyle} onClick={() => router.push('/closet')}>
              {strings.common.cancel}
            </button>
          ) : null}
        </div>

        {stage === 'picker' ? (
          <>
            {linkError ? (
              <p style={linkErrorStyle} role="alert">
                {linkError}
              </p>
            ) : null}
            <PhotoPicker
              onPick={handlePick}
              onLink={handleLink}
              linkValue={linkUrl}
              onLinkChange={setLinkUrl}
              linkFailed={Boolean(linkError)}
              onBulk={handleBulk}
              onReceipt={handleReceipt}
            />
          </>
        ) : null}

        {stage === 'receipt' ? (
          <ReceiptImport onReview={() => router.push('/closet')} />
        ) : null}

        {stage === 'bulk' ? (
          <BulkCapture
            onDone={() => router.push('/closet')}
            onBack={() => setStage('picker')}
          />
        ) : null}

        {stage === 'loading' ? <StatusPulse label={strings.closet.processing} /> : null}
        {stage === 'uploading' ? <StatusPulse label={strings.closet.uploading} /> : null}
        {stage === 'processing' ? <StatusPulse label={strings.closet.processing} /> : null}
        {stage === 'importing' ? <StatusPulse label={strings.closet.importLink} /> : null}

        {stage === 'confirm' && confirmData ? (
          <ConfirmItem
            item={confirmData.item}
            processed={confirmData.processed}
            busy={saving}
            onConfirm={runConfirm}
          />
        ) : null}

        {stage === 'saved' ? <StatusPulse label={strings.closet.saved} /> : null}

        {stage === 'error' ? (
          <div style={statusColumnStyle} aria-live="assertive">
            <p style={errorTextStyle}>{limitMessage ?? strings.closet.addFailed}</p>
            {/* A daily-limit stop offers no retry (it would re-hit the cap); the
                top Cancel returns to the closet. Other failures keep Retry. */}
            {limitMessage ? null : (
              <Button variant="primary" onClick={handleRetry}>
                {strings.closet.retryCta}
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}
