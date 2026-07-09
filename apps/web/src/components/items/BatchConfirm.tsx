'use client';

import { useState, type CSSProperties } from 'react';
import { typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { Button } from '../Button';
import { Card } from '../Card';
import { Chip } from '../Chip';
import { Input } from '../Input';
import { CATEGORY_OPTIONS } from './constants';
import { batchItemEdits, type BatchItem } from '../../lib/bulk-capture';
import type { ItemCategory } from './types';

export interface BatchConfirmProps {
  /** The pieces the batch route segmented + persisted (drafts, unconfirmed). */
  items: BatchItem[];
  /** How many crops failed to process — drives the partial-failure line. */
  failed: number;
  /** All pieces resolved (confirmed or discarded) — head to the closet. */
  onDone: () => void;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/** Per-piece progress through the review: edit → confirm (or discard). */
type ItemStatus = 'pending' | 'saving' | 'confirmed' | 'discarded' | 'error';

interface RowState {
  readonly id: string;
  readonly originalName: string;
  readonly originalCategory: string;
  name: string;
  category: string;
  status: ItemStatus;
}

const titleCase = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

function initialRows(items: BatchItem[]): RowState[] {
  return items.map((item) => ({
    id: item.id,
    originalName: item.name,
    originalCategory: item.category,
    name: item.name,
    category: item.category,
    status: 'pending',
  }));
}

export function BatchConfirm({ items, failed, onDone }: BatchConfirmProps) {
  const [rows, setRows] = useState<RowState[]>(() => initialRows(items));
  const [editing, setEditing] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const total = rows.length;
  const labels = strings.closet.fieldLabels;

  function patchRow(id: string, patch: Partial<RowState>): void {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  /** PATCH one row to confirmed (with any changed name/category). Returns success. */
  async function confirmRow(row: RowState): Promise<boolean> {
    const edits = batchItemEdits(
      { name: row.originalName, category: row.originalCategory },
      { name: row.name, category: row.category },
    );
    const body: { updates?: typeof edits; confirm: boolean } = { confirm: true };
    if (Object.keys(edits).length > 0) body.updates = edits;
    try {
      const res = await fetch(`/api/items/${row.id}`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Discard one piece: the same archive PATCH the detail sheet uses (reversible). */
  async function discardRow(id: string): Promise<void> {
    patchRow(id, { status: 'saving' });
    try {
      const res = await fetch(`/api/items/${id}`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ archived: true }),
      });
      patchRow(id, { status: res.ok ? 'discarded' : 'error' });
    } catch {
      patchRow(id, { status: 'error' });
    }
    setEditing((prev) => (prev === id ? null : prev));
  }

  /**
   * Confirm every piece still pending (or previously errored), leaving discarded
   * ones untouched. When nothing is left unresolved, head to the closet — where
   * anything not confirmed here still surfaces as a draft to review later.
   */
  async function confirmAll(): Promise<void> {
    setWorking(true);
    setEditing(null);
    // Non-target rows are already resolved (discarded or confirmed); the targets
    // are everything still pending or previously errored. If they all land, the
    // whole batch is resolved and we can head to the closet.
    const targets = rows.filter((row) => row.status === 'pending' || row.status === 'error');
    let allOk = true;
    for (const row of targets) {
      patchRow(row.id, { status: 'saving' });
      const ok = await confirmRow(row);
      patchRow(row.id, { status: ok ? 'confirmed' : 'error' });
      if (!ok) allOk = false;
    }
    setWorking(false);
    if (allOk) onDone();
  }

  return (
    <div style={columnStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>{strings.closet.bulkCapture.confirmTitle}</h1>
        <p style={subtitleStyle}>{strings.closet.bulkCapture.confirmSubtitle}</p>
        <p style={countStyle}>{strings.closet.bulkCapture.found(total)}</p>
        {failed > 0 ? <p style={partialStyle}>{strings.closet.bulkCapture.partialFailure}</p> : null}
      </div>

      <ul style={listStyle}>
        {rows.map((row, index) => {
          const resolved = row.status === 'confirmed' || row.status === 'discarded';
          const busy = row.status === 'saving';
          const imageUrl = items[index]?.imageUrl ?? null;
          return (
            <li key={row.id} style={{ listStyle: 'none' }}>
              <div
                role="group"
                aria-label={strings.closet.bulkCapture.itemPosition(index + 1, total)}
                style={{ ...rowStyle, opacity: resolved ? 0.5 : 1 }}
              >
                <Card aspect="item" style={thumbStyle}>
                  <div style={thumbInner}>
                    {imageUrl ? <img src={imageUrl} alt={row.name} style={thumbImg} /> : null}
                  </div>
                </Card>

                <div style={fieldsStyle}>
                  <Input
                    aria-label={labels.name}
                    placeholder={labels.name}
                    value={row.name}
                    disabled={resolved || busy}
                    onChange={(event) => patchRow(row.id, { name: event.target.value })}
                  />

                  <Chip
                    selected={editing === row.id}
                    disabled={resolved || busy}
                    aria-label={`${labels.category}: ${titleCase(row.category)}`}
                    onClick={() => setEditing((prev) => (prev === row.id ? null : row.id))}
                  >
                    {titleCase(row.category)}
                  </Chip>

                  {editing === row.id ? (
                    <div style={editorStyle} role="group" aria-label={labels.category}>
                      {CATEGORY_OPTIONS.map((opt) => (
                        <Chip
                          key={opt}
                          selected={opt === row.category}
                          onClick={() => {
                            patchRow(row.id, { category: opt as ItemCategory });
                            setEditing(null);
                          }}
                        >
                          {titleCase(opt)}
                        </Chip>
                      ))}
                    </div>
                  ) : null}

                  {!resolved ? (
                    <button
                      type="button"
                      style={discardStyle}
                      disabled={busy}
                      onClick={() => void discardRow(row.id)}
                    >
                      {strings.closet.archive}
                    </button>
                  ) : (
                    <span style={statusStyle} aria-hidden="true">
                      {row.status === 'confirmed' ? '✓' : '—'}
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <Button variant="primary" disabled={working} onClick={() => void confirmAll()}>
        {strings.closet.confirmCta}
      </Button>
    </div>
  );
}

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
  width: '100%',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.title2.rem,
  lineHeight: `${typeRamp.title2.lineHeight}px`,
  fontWeight: 700,
};

const subtitleStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

const countStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

const partialStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-rust)',
};

const listStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  margin: 0,
  padding: 0,
};

const rowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-4)',
  alignItems: 'flex-start',
};

const thumbStyle: CSSProperties = {
  width: 'calc(var(--space-16) + var(--space-8))',
  flexShrink: 0,
};

const thumbInner: CSSProperties = {
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const thumbImg: CSSProperties = {
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
};

const fieldsStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  alignItems: 'flex-start',
};

const editorStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
};

const discardStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--color-secondary-strong)',
  fontSize: typeRamp.footnote.rem,
  fontWeight: 600,
  minHeight: 'var(--touch-target-min)',
  paddingInline: 0,
};

const statusStyle: CSSProperties = {
  fontSize: typeRamp.body.rem,
  color: 'var(--color-secondary-strong)',
};
