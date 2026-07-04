'use client';

import { useState, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken, typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { transitionFor } from '../../lib/motion';
import { GlassSheet } from '../GlassSheet';
import { Input } from '../Input';
import { Button } from '../Button';
import { ERA_DESCRIPTION_MAX, ERA_TITLE_MAX } from './constants';
import type { EraSummary } from './types';

export interface EraAssignSheetProps {
  eras: EraSummary[];
  busy: boolean;
  onAssignExisting: (eraId: string) => void;
  onCreateAndAssign: (title: string, description: string) => void;
  onClose: () => void;
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

const eraRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  width: '100%',
  minHeight: 'var(--touch-target-min)',
  paddingInline: 'var(--space-3)',
  borderRadius: 'var(--radius-input)',
  border: '1px solid var(--color-hairline)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontSize: typeRamp.body.rem,
  cursor: 'pointer',
};

const countStyle: CSSProperties = {
  color: 'var(--color-secondary-strong)',
  fontSize: typeRamp.footnote.rem,
};

const dividerLabelStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary-strong)',
  fontSize: typeRamp.footnote.rem,
  fontWeight: 600,
};

const createStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

/**
 * Add an outfit to an era: pick from existing eras or start a new one inline.
 * Either path ends by linking the outfit, so its cover lands in the era's
 * collage. Locks while a link is in flight.
 */
export function EraAssignSheet({ eras, busy, onAssignExisting, onCreateAndAssign, onClose }: EraAssignSheetProps) {
  const reduced = useReducedMotion();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  return (
    <>
      <motion.div
        style={backdropStyle}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transitionFor(motionToken.springs.gentle, reduced)}
        onClick={busy ? undefined : onClose}
      />
      <GlassSheet peek>
        <div style={contentStyle}>
          <h2 style={titleStyle}>{strings.design.assignToEra}</h2>

          {eras.map((era) => (
            <button
              key={era.id}
              type="button"
              style={eraRowStyle}
              disabled={busy}
              onClick={() => onAssignExisting(era.id)}
            >
              <span>{era.title}</span>
              <span style={countStyle} aria-hidden="true">{era.outfitCount}</span>
            </button>
          ))}

          <div style={createStyle}>
            <p style={dividerLabelStyle}>{strings.design.newEra}</p>
            <Input
              aria-label={strings.design.eraTitlePlaceholder}
              placeholder={strings.design.eraTitlePlaceholder}
              value={title}
              maxLength={ERA_TITLE_MAX}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
            />
            <Input
              aria-label={strings.design.eraDescriptionPlaceholder}
              placeholder={strings.design.eraDescriptionPlaceholder}
              value={description}
              maxLength={ERA_DESCRIPTION_MAX}
              disabled={busy}
              onChange={(event) => setDescription(event.target.value)}
            />
            <Button
              variant="primary"
              disabled={busy || title.trim().length === 0}
              onClick={() => onCreateAndAssign(title.trim(), description.trim())}
            >
              {strings.design.newEra}
            </Button>
          </div>
        </div>
      </GlassSheet>
    </>
  );
}
