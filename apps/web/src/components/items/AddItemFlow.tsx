'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { Button } from '../Button';
import { ConfirmItem } from './ConfirmItem';
import { PhotoPicker } from './PhotoPicker';
import { downscaleToJpeg } from './downscale';
import type { Item, ItemEdits, ItemWithDisplay, Processed } from './types';

export interface AddItemFlowProps {
  /** When set, skip the picker and resume at confirm for this existing item. */
  resumeItemId?: string | null;
}

type Stage = 'picker' | 'loading' | 'uploading' | 'processing' | 'confirm' | 'saved' | 'error';

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

const statusTextStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

const errorTextStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-text)',
};

/** A gentle breathing status line for the in-flight stages (reduced-motion safe). */
function StatusPulse({ label }: { label: string }) {
  const reduced = useReducedMotion();
  return (
    <div style={statusColumnStyle} aria-live="polite">
      <motion.p
        style={statusTextStyle}
        animate={reduced ? undefined : { opacity: [0.55, 1, 0.55] }}
        transition={reduced ? undefined : { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        {label}
      </motion.p>
    </div>
  );
}

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
  const [stage, setStage] = useState<Stage>(resumeItemId ? 'loading' : 'picker');
  const [confirmData, setConfirmData] = useState<{ item: ItemWithDisplay; processed: Processed } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [failedStage, setFailedStage] = useState<FailedStage | null>(null);

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

  async function runProcess() {
    setStage('processing');
    try {
      const res = await fetch('/api/process-item', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ rawKey: rawKeyRef.current }),
      });
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

  const showCancel = stage === 'picker' || stage === 'confirm' || stage === 'error';

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

        {stage === 'picker' ? <PhotoPicker onPick={handlePick} /> : null}

        {stage === 'loading' ? <StatusPulse label={strings.closet.processing} /> : null}
        {stage === 'uploading' ? <StatusPulse label={strings.closet.uploading} /> : null}
        {stage === 'processing' ? <StatusPulse label={strings.closet.processing} /> : null}

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
            <p style={errorTextStyle}>{strings.closet.addFailed}</p>
            <Button variant="primary" onClick={handleRetry}>
              {strings.closet.retryCta}
            </Button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
