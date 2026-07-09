'use client';

import { useRef, useState, type CSSProperties } from 'react';
import { typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { Button } from '../Button';
import { Card } from '../Card';
import { BatchConfirm } from './BatchConfirm';
import { StatusPulse } from './StatusPulse';
import { downscaleToJpeg } from './downscale';
import { classifyBatchResponse, type BatchItem } from '../../lib/bulk-capture';

export interface BulkCaptureProps {
  /** Every piece resolved / nothing to review — head to the closet. */
  onDone: () => void;
  /** Return to the add picker (e.g. to add pieces one at a time instead). */
  onBack: () => void;
}

type Mode = 'pick' | 'uploading' | 'working' | 'confirm' | 'dormant' | 'no_items' | 'limit' | 'paused' | 'error';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/**
 * The batch (several-at-once) capture flow: one flat-lay photo → the shared
 * upload path (downscale → signed PUT) → POST /api/process-batch → a batch
 * confirm screen. The response is classified once (client `classifyBatchResponse`)
 * into the state to show: confirm when pieces came back, the warm dormant beat
 * when segmentation isn't switched on, retry guidance when nothing was found, or
 * the daily-limit / AI-paused / generic-error beats. The uploaded raw is retained
 * so an AI-paused retry re-runs the batch without re-uploading.
 */
export function BulkCapture({ onDone, onBack }: BulkCaptureProps) {
  const [mode, setMode] = useState<Mode>('pick');
  const [confirmData, setConfirmData] = useState<{ items: BatchItem[]; failed: number } | null>(null);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const rawKeyRef = useRef<string | null>(null);

  async function runBatch(rawKey: string): Promise<void> {
    setMode('working');
    try {
      const res = await fetch('/api/process-batch', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ rawKey }),
      });
      const body: unknown = await res.json().catch(() => null);
      const outcome = classifyBatchResponse(res.status, body);
      switch (outcome.kind) {
        case 'confirm':
          setConfirmData({ items: outcome.items, failed: outcome.failed });
          setMode('confirm');
          break;
        case 'dormant':
          setMode('dormant');
          break;
        case 'no_items':
          setMode('no_items');
          break;
        case 'daily_limit':
          setLimitMessage(outcome.message ?? strings.ovi.limitReachedProcessing);
          setMode('limit');
          break;
        case 'ai_paused':
          setMode('paused');
          break;
        case 'error':
          setMode('error');
          break;
      }
    } catch {
      setMode('error');
    }
  }

  // Same upload path AddItemFlow uses: downscale → signed PUT → rawKey → batch.
  async function runUpload(file: File): Promise<void> {
    setMode('uploading');
    try {
      const blob = await downscaleToJpeg(file);
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
      await runBatch(key);
    } catch {
      setMode('error');
    }
  }

  function handlePick(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void runUpload(file);
  }

  function retryBatch(): void {
    if (rawKeyRef.current) void runBatch(rawKeyRef.current);
  }

  if (mode === 'uploading') return <StatusPulse label={strings.closet.uploading} />;
  if (mode === 'working') return <StatusPulse label={strings.closet.bulkCapture.working} />;

  if (mode === 'confirm' && confirmData) {
    return <BatchConfirm items={confirmData.items} failed={confirmData.failed} onDone={onDone} />;
  }

  if (mode === 'dormant') {
    return (
      <StatusMessage tone="text" message={strings.closet.bulkCapture.dormant}>
        <Button variant="primary" onClick={onBack}>
          {strings.common.continue}
        </Button>
      </StatusMessage>
    );
  }

  if (mode === 'no_items') {
    return (
      <StatusMessage tone="text" message={strings.closet.bulkCapture.found(0)}>
        <Button variant="primary" onClick={onBack}>
          {strings.closet.retryCta}
        </Button>
      </StatusMessage>
    );
  }

  if (mode === 'limit') {
    return (
      <StatusMessage tone="text" message={limitMessage ?? strings.ovi.limitReachedProcessing}>
        <Button variant="primary" onClick={onDone}>
          {strings.common.continue}
        </Button>
      </StatusMessage>
    );
  }

  if (mode === 'paused') {
    return (
      <StatusMessage tone="text" message={strings.ovi.resting}>
        <Button variant="primary" onClick={retryBatch}>
          {strings.closet.retryCta}
        </Button>
      </StatusMessage>
    );
  }

  if (mode === 'error') {
    return (
      <StatusMessage tone="assertive" message={strings.closet.addFailed}>
        <Button variant="primary" onClick={onBack}>
          {strings.closet.retryCta}
        </Button>
      </StatusMessage>
    );
  }

  // mode === 'pick'
  return (
    <div style={columnStyle}>
      <p style={instructionStyle}>{strings.closet.bulkCapture.instruction}</p>
      <div style={gridStyle}>
        <label style={labelStyle}>
          <input type="file" accept="image/*" capture="environment" style={hiddenInputStyle} onChange={handlePick} />
          <Card interactive>
            <div style={tileStyle}>
              <span style={glyphStyle} aria-hidden="true">
                ◉
              </span>
              <span style={captionStyle}>{strings.closet.takePhoto}</span>
            </div>
          </Card>
        </label>
        <label style={labelStyle}>
          <input type="file" accept="image/*" style={hiddenInputStyle} onChange={handlePick} />
          <Card interactive>
            <div style={tileStyle}>
              <span style={glyphStyle} aria-hidden="true">
                ▦
              </span>
              <span style={captionStyle}>{strings.closet.pickPhoto}</span>
            </div>
          </Card>
        </label>
      </div>
    </div>
  );
}

/** A centered message beat (dormant / no-items / limit / paused / error) + action. */
function StatusMessage({
  message,
  tone,
  children,
}: {
  message: string;
  tone: 'text' | 'assertive';
  children: React.ReactNode;
}) {
  return (
    <div style={messageColumnStyle} aria-live={tone === 'assertive' ? 'assertive' : 'polite'}>
      <p style={messageStyle}>{message}</p>
      {children}
    </div>
  );
}

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
  width: '100%',
};

const instructionStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-4)',
  gridTemplateColumns: '1fr 1fr',
  width: '100%',
};

const labelStyle: CSSProperties = {
  display: 'block',
  cursor: 'pointer',
};

const hiddenInputStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

const tileStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-2)',
  minHeight: 'var(--space-16)',
  padding: 'var(--space-6)',
  textAlign: 'center',
};

const glyphStyle: CSSProperties = {
  fontSize: typeRamp.title1.rem,
  lineHeight: 1,
};

const captionStyle: CSSProperties = {
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  fontWeight: 600,
  color: 'var(--color-text)',
};

const messageColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-6)',
  paddingBlock: 'var(--space-16)',
  textAlign: 'center',
};

const messageStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-text)',
};
