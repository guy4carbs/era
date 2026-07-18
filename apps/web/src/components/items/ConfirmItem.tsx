'use client';

import { useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { motion as motionToken } from '@era/tokens';
import { Text } from '../Text';
import { strings } from '@era/core/strings';
import { transitionFor } from '../../lib/motion';
import { Button } from '../Button';
import { Card } from '../Card';
import { Chip } from '../Chip';
import { Input } from '../Input';
import { CATEGORY_OPTIONS, COLOR_WORDS, PATTERN_OPTIONS } from './constants';
import type {
  EditableField,
  ItemCategory,
  ItemEdits,
  ItemPattern,
  ItemWithDisplay,
  Processed,
} from './types';

export interface ConfirmItemProps {
  item: ItemWithDisplay;
  processed: Processed;
  /** True while the confirm PATCH is in flight — disables the confirm action. */
  busy: boolean;
  /** Fires with the changed-only patch when the user confirms. */
  onConfirm: (edits: ItemEdits) => void;
}

/** The six fields, in the order they read across the chips row. */
const FIELDS: readonly EditableField[] = [
  'category',
  'name',
  'brand',
  'colorPrimary',
  'colors',
  'pattern',
];

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
  width: '100%',
};

const imageCardInner: CSSProperties = {
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const imageStyle: CSSProperties = {
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
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

const ghostChipStyle: CSSProperties = { color: 'var(--color-secondary)' };

const titleCase = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1);

/**
 * The fast confirm screen. The cutout renders large on a cream item card; each
 * of the six fields is one editable chip that reads its current value or a
 * ghost "add {label}" placeholder. A single tap opens an inline editor (fixed
 * option chips, a colour-word row, or a small text input); a second tap sets
 * the value locally. Confirm sends only the fields the user actually changed.
 */
export function ConfirmItem({ item, processed, busy, onConfirm }: ConfirmItemProps) {
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

  // category and name are NOT NULL, so process-item stores placeholders
  // ('top' / 'New item') when vision fails. Those must read as UNSET until the
  // user actively sets them — otherwise a placeholder masquerades as a real tag.
  const categorySet = processed.vision || edits.category !== undefined;
  const nameSet = processed.vision
    ? name.trim().length > 0
    : edits.name !== undefined && name.trim().length > 0;

  // A human-readable value per field, plus whether it is set (vs. ghost).
  function fieldText(field: EditableField): { text: string; filled: boolean } {
    switch (field) {
      case 'category':
        return categorySet
          ? { text: titleCase(category), filled: true }
          : { text: strings.closet.fieldUnset(labels.category), filled: false };
      case 'name':
        return nameSet
          ? { text: name, filled: true }
          : { text: strings.closet.fieldUnset(labels.name), filled: false };
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
        // Multi-select: toggling stays open so several colours can be chosen.
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

  const title = processed.vision ? strings.closet.processedTitle : strings.closet.manualTitle;

  return (
    <div style={columnStyle}>
      <Card aspect="item">
        <div style={imageCardInner}>
          {item.displayUrl ? (
            <img src={item.displayUrl} alt={name} style={imageStyle} />
          ) : null}
        </div>
      </Card>

      <Text variant="title" size="title2" as="h1" weight={700} style={{ margin: 0 }}>{title}</Text>

      <div style={chipsRowStyle} role="group" aria-label={strings.closet.manualTitle}>
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

      <Button variant="primary" disabled={busy || !categorySet} onClick={() => onConfirm(edits)}>
        {strings.closet.confirmCta}
      </Button>
    </div>
  );
}
