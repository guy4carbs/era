'use client';

import { useState, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken, typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { transitionFor } from '../../lib/motion';
import { GlassSheet } from '../GlassSheet';
import { Input } from '../Input';
import { Button } from '../Button';
import { OUTFIT_NAME_MAX, OUTFIT_OCCASION_MAX } from './constants';

export interface SaveOutfitSheetProps {
  initialName: string;
  initialOccasion: string;
  saving: boolean;
  onSave: (name: string, occasion: string) => void;
  onCancel: () => void;
}

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'color-mix(in srgb, var(--color-ink) 45%, transparent)',
  zIndex: 45,
};

const contentStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  paddingTop: 'var(--space-4)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.title2.rem,
  lineHeight: `${typeRamp.title2.lineHeight}px`,
  fontWeight: 700,
};

const savingStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary-strong)',
  fontSize: typeRamp.footnote.rem,
};

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-3)',
  justifyContent: 'flex-end',
};

/**
 * Name-and-save the current look. A frosted sheet with the outfit name + an
 * occasion tag, then a save that composes the cover and persists. While saving,
 * the controls lock and a quiet progress line shows the compose-and-save beat.
 */
export function SaveOutfitSheet({ initialName, initialOccasion, saving, onSave, onCancel }: SaveOutfitSheetProps) {
  const reduced = useReducedMotion();
  const [name, setName] = useState(initialName);
  const [occasion, setOccasion] = useState(initialOccasion);

  return (
    <>
      <motion.div
        style={backdropStyle}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transitionFor(motionToken.springs.gentle, reduced)}
        onClick={saving ? undefined : onCancel}
      />
      <GlassSheet>
        <div style={contentStyle}>
          <h2 style={titleStyle}>{strings.design.saveOutfit}</h2>
          <Input
            aria-label={strings.design.outfitNamePlaceholder}
            placeholder={strings.design.outfitNamePlaceholder}
            value={name}
            maxLength={OUTFIT_NAME_MAX}
            disabled={saving}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            aria-label={strings.design.occasionPlaceholder}
            placeholder={strings.design.occasionPlaceholder}
            value={occasion}
            maxLength={OUTFIT_OCCASION_MAX}
            disabled={saving}
            onChange={(event) => setOccasion(event.target.value)}
          />
          {saving ? <p style={savingStyle}>{strings.design.saving}</p> : null}
          <div style={actionsStyle}>
            <Button variant="ghost" disabled={saving} onClick={onCancel}>
              {strings.common.cancel}
            </Button>
            <Button variant="primary" disabled={saving} onClick={() => onSave(name.trim(), occasion.trim())}>
              {saving ? strings.design.saving : strings.design.saveOutfit}
            </Button>
          </div>
        </div>
      </GlassSheet>
    </>
  );
}
