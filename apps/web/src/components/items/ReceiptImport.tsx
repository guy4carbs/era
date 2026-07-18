'use client';

import { useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { Button } from '../Button';
import { StatusPulse } from './StatusPulse';
import {
  isEmailWithinCap,
  parseReceiptResult,
  receiptOutcome,
  type ReceiptOutcome,
} from '../../lib/receipt-import';

export interface ReceiptImportProps {
  /** Head to the closet to review the imported drafts (where unconfirmed pieces surface). */
  onReview: () => void;
}

type Mode = 'input' | 'parsing' | 'result' | 'error';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

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

const fieldColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

// Mirrors the Input primitive's field surface, sized for a pasted email body.
const textareaStyle: CSSProperties = {
  width: '100%',
  minHeight: 'var(--space-16)',
  paddingInline: 'var(--space-3)',
  paddingBlock: 'var(--space-2)',
  borderRadius: 'var(--radius-input)',
  border: '1px solid var(--color-hairline)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  resize: 'vertical',
  // eslint-disable-next-line no-restricted-syntax -- textarea inherits the body sans stack; no brand-face declaration
  fontFamily: 'inherit',
};

const overLimitStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-rust)',
};

const resultTextStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-text)',
};

/**
 * The receipt-import view: paste (or drop a .eml onto) a forwarded order email,
 * POST it to /api/import-email, and report how many drafts landed. Imported items
 * are drafts (`tagsConfirmed: false`), so success routes into the closet, where
 * unconfirmed pieces already surface with a "tap to confirm" dot for review.
 *
 * The paste is capped client-side at the server's 1MB `rawEmail` limit (a
 * friendly over-limit line, submit disabled) so an oversized paste never makes
 * the round-trip. A zero-result import is honest, not an error: it shows a single
 * "try a photo or link" nudge. Drag-and-drop of a `.eml` file reads it as text
 * into the same box (native paste works too) — no new deps.
 */
export function ReceiptImport({ onReview }: ReceiptImportProps) {
  const [mode, setMode] = useState<Mode>('input');
  const [raw, setRaw] = useState('');
  const [outcome, setOutcome] = useState<ReceiptOutcome | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const withinCap = isEmailWithinCap(raw);
  const canSubmit = raw.trim().length > 0 && withinCap;

  async function submit() {
    if (!canSubmit) return;
    setMode('parsing');
    try {
      const res = await fetch('/api/import-email', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ rawEmail: raw }),
      });
      if (!res.ok) throw new Error('import failed');
      const parsed = parseReceiptResult(await res.json());
      if (!parsed) throw new Error('unexpected body');
      setOutcome(receiptOutcome(parsed));
      setMode('result');
    } catch {
      setMode('error');
    }
  }

  // Read a dropped .eml (or any text file) into the paste box as raw text.
  async function handleDrop(event: DragEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    try {
      setRaw(await file.text());
    } catch {
      // A file we can't read as text is a no-op — the user can still paste.
    }
  }

  function handleDragEnter(event: DragEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function handleDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  if (mode === 'parsing') {
    return <StatusPulse label={strings.closet.importReceipt.parsing} />;
  }

  if (mode === 'result' && outcome) {
    return (
      <div style={columnStyle} aria-live="polite">
        {outcome.kind === 'added' ? (
          <>
            <p style={resultTextStyle}>{strings.closet.importReceipt.added(outcome.count)}</p>
            <Button variant="primary" onClick={onReview}>
              {strings.common.continue}
            </Button>
          </>
        ) : (
          <>
            {/* Zero drafts: one honest line that carries the way forward (a photo
                or a link), not two near-identical "couldn't read it" lines. */}
            <p style={resultTextStyle}>{strings.closet.importReceipt.unsupported}</p>
            <Button variant="primary" onClick={() => setMode('input')}>
              {strings.closet.retryCta}
            </Button>
          </>
        )}
      </div>
    );
  }

  if (mode === 'error') {
    return (
      <div style={columnStyle} aria-live="assertive">
        <p style={resultTextStyle}>{strings.closet.importReceipt.error}</p>
        <Button variant="primary" onClick={submit}>
          {strings.closet.retryCta}
        </Button>
      </div>
    );
  }

  return (
    <div style={columnStyle}>
      <p style={instructionStyle}>{strings.closet.importReceipt.instruction}</p>

      <div style={fieldColumnStyle}>
        <textarea
          aria-label={strings.closet.importReceipt.entryCta}
          aria-invalid={!withinCap ? true : undefined}
          placeholder={strings.closet.importReceipt.pastePlaceholder}
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          onDrop={handleDrop}
          onDragOver={(event) => event.preventDefault()}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          rows={8}
          style={{
            ...textareaStyle,
            borderColor: !withinCap
              ? 'var(--color-rust)'
              : dragging
                ? 'var(--color-accent)'
                : 'var(--color-hairline)',
          }}
        />
        {!withinCap ? (
          <p style={overLimitStyle} role="alert">
            {strings.closet.importReceipt.tooLong}
          </p>
        ) : null}
      </div>

      <Button variant="primary" onClick={submit} disabled={!canSubmit}>
        {strings.common.continue}
      </Button>
    </div>
  );
}
