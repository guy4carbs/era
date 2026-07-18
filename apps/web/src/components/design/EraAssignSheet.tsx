'use client';

import { useState, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { motion as motionToken } from '@era/tokens';
import { Text } from '../Text';
import { strings } from '@era/core/strings';
import { pressProps, transitionFor } from '../../lib/motion';
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
  cursor: 'pointer',
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
          <Text variant="title" size="title2" as="h2" style={{ margin: 0 }}>
            {strings.design.assignToEra}
          </Text>

          {eras.map((era) => (
            <motion.button
              key={era.id}
              type="button"
              style={eraRowStyle}
              disabled={busy}
              onClick={() => onAssignExisting(era.id)}
              {...pressProps(reduced, !busy)}
            >
              {/* An era name, but this is a control (list-row button) — serif is
                  barred inside controls, so it reads in Geist (ui), not oviAccent. */}
              <Text variant="ui" as="span" style={{ color: 'var(--color-text)' }}>{era.title}</Text>
              <Text variant="caption" size="footnote" as="span" aria-hidden="true" style={{ color: 'var(--color-secondary-strong)' }}>
                {era.outfitCount}
              </Text>
            </motion.button>
          ))}

          <div style={createStyle}>
            <Text variant="caption" size="footnote" weight={600} as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>
              {strings.design.newEra}
            </Text>
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
