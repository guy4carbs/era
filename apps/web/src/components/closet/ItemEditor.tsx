'use client';

import { useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken } from '@era/tokens';
import { strings } from '@era/core/strings';
import { transitionFor } from '../../lib/motion';
import { Button } from '../Button';
import { Chip } from '../Chip';
import { Input } from '../Input';
import {
  CATEGORY_OPTIONS,
  COLOR_WORDS,
  PATTERN_OPTIONS,
  type EditableField,
  type ItemCategory,
  type ItemEdits,
  type ItemPattern,
} from '../items';
import type { GalleryItem } from './types';

export interface ItemEditorProps {
  item: GalleryItem;
  /** True while the PATCH is in flight — disables Save. */
  busy: boolean;
  /** Fires with the changed-only patch when the user saves. */
  onSave: (edits: ItemEdits) => void;
  /** Dismiss the editor without saving. */
  onCancel: () => void;
}

/** The six editable fields, in the order they read across the chips row. */
const FIELDS: readonly EditableField[] = [
  'category',
  'name',
  'brand',
  'colorPrimary',
  'colors',
  'pattern',
];

const titleCase = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1);

/**
 * Compact tag editor for the detail sheet. Each field is one chip showing its
 * current value (or a ghost "Add {field}" for empty optionals); a tap opens an
 * inline editor — fixed option chips, a colour-word row, or a text input — and a
 * second tap sets the value locally. Save sends only the fields the user
 * actually changed (PATCH `{ updates }` upstream). Mirrors the confirm-screen
 * interaction, scoped to editing an item already in the closet.
 */
export function ItemEditor({ item, busy, onSave, onCancel }: ItemEditorProps) {
  const reduced = useReducedMotion();
  const [edits, setEdits] = useState<ItemEdits>({});
  const [activeField, setActiveField] = useState<EditableField | null>(null);

  const labels = strings.closet.fieldLabels;

  // Merged current value: a local edit wins over the item's stored value.
  const category = edits.category ?? item.category;
  const name = edits.name ?? item.name;
  const brand = edits.brand ?? item.brand ?? '';
  const colorPrimary = edits.colorPrimary ?? item.colorPrimary ?? '';
  const colors = edits.colors ?? item.colors ?? [];
  const pattern = edits.pattern ?? item.pattern ?? null;

  function fieldText(field: EditableField): { text: string; filled: boolean } {
    switch (field) {
      case 'category':
        return { text: titleCase(category), filled: true };
      case 'name':
        return { text: name, filled: true };
      case 'brand':
        return brand.trim().length > 0
          ? { text: brand, filled: true }
          : { text: strings.closet.fieldUnset(labels.brand), filled: false };
      case 'colorPrimary':
        return colorPrimary.length > 0
          ? { text: titleCase(colorPrimary), filled: true }
          : { text: strings.closet.fieldUnset(labels.colorPrimary), filled: false };
      case 'colors':
        return colors.length > 0
          ? { text: colors.map(titleCase).join(', '), filled: true }
          : { text: strings.closet.fieldUnset(labels.colors), filled: false };
      case 'pattern':
        return pattern
          ? { text: titleCase(pattern), filled: true }
          : { text: strings.closet.fieldUnset(labels.pattern), filled: false };
    }
  }

  function toggleColor(word: string): void {
    const next = colors.includes(word)
      ? colors.filter((c) => c !== word)
      : [...colors, word];
    setEdits((prev) => ({ ...prev, colors: next }));
  }

  function renderEditor(field: EditableField) {
    switch (field) {
      case 'category':
        return CATEGORY_OPTIONS.map((opt) => (
          <Chip
            key={opt}
            selected={opt === category}
            onClick={() => {
              setEdits((prev) => ({ ...prev, category: opt as ItemCategory }));
              setActiveField(null);
            }}
          >
            {titleCase(opt)}
          </Chip>
        ));
      case 'pattern':
        return PATTERN_OPTIONS.map((opt) => (
          <Chip
            key={opt}
            selected={opt === pattern}
            onClick={() => {
              setEdits((prev) => ({ ...prev, pattern: opt as ItemPattern }));
              setActiveField(null);
            }}
          >
            {titleCase(opt)}
          </Chip>
        ));
      case 'colorPrimary':
        return COLOR_WORDS.map((word) => (
          <Chip
            key={word}
            selected={word === colorPrimary}
            onClick={() => {
              setEdits((prev) => ({ ...prev, colorPrimary: word }));
              setActiveField(null);
            }}
          >
            {titleCase(word)}
          </Chip>
        ));
      case 'colors':
        return COLOR_WORDS.map((word) => (
          <Chip key={word} selected={colors.includes(word)} onClick={() => toggleColor(word)}>
            {titleCase(word)}
          </Chip>
        ));
      case 'name':
      case 'brand':
        return (
          <div style={{ width: '100%' }}>
            <Input
              autoFocus
              aria-label={labels[field]}
              placeholder={labels[field]}
              value={field === 'name' ? name : brand}
              onChange={(event) =>
                setEdits((prev) => ({ ...prev, [field]: event.target.value }))
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') setActiveField(null);
              }}
              onBlur={() => setActiveField(null)}
            />
          </div>
        );
    }
  }

  return (
    <div style={columnStyle}>
      <div style={chipsRowStyle} role="group" aria-label={strings.closet.edit}>
        {FIELDS.map((field) => {
          const { text, filled } = fieldText(field);
          const isActive = activeField === field;
          return (
            <Chip
              key={field}
              selected={isActive}
              aria-label={`${labels[field]}: ${text}`}
              style={!filled && !isActive ? ghostChipStyle : undefined}
              onClick={() => setActiveField((prev) => (prev === field ? null : field))}
            >
              {text}
            </Chip>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {activeField ? (
          <motion.div
            key={activeField}
            style={editorPanelStyle}
            role="group"
            aria-label={labels[activeField]}
            initial={reduced ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
            transition={transitionFor(motionToken.springs.gentle, reduced)}
          >
            {renderEditor(activeField)}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div style={actionsRowStyle}>
        <Button variant="secondary" onClick={onCancel}>
          {strings.common.cancel}
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => onSave(edits)}>
          {strings.common.save}
        </Button>
      </div>
    </div>
  );
}

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  width: '100%',
};

const chipsRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
};

const editorPanelStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  paddingBlock: 'var(--space-2)',
};

const actionsRowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  justifyContent: 'flex-end',
};

// Placeholder colour for an unset optional field (ghost chip).
const ghostChipStyle: CSSProperties = { color: 'var(--color-secondary)' };
