'use client';

import { type CSSProperties } from 'react';
import { strings } from '@era/core/strings';
import { Button } from '../Button';
import { OviOrb } from '../ovi/OviOrb';
import { Text } from '../Text';

export interface ClosetEmptyProps {
  /** Start the add flow. */
  onAddPhoto: () => void;
}

/**
 * The empty closet — signature decision #13. Ovi's small orb breathes above ONE
 * Fraunces line ({@link strings.closet.emptySignature}) and a single primary
 * action into the add flow. An invitation, not an instruction: the old title +
 * body copy and the second import button are gone — absence over noise.
 */
export function ClosetEmpty({ onAddPhoto }: ClosetEmptyProps) {
  return (
    <div style={columnStyle}>
      {/* The signature orb — now the shared dimensional OviOrb (idle, non-
          interactive) at this moment's 24px size, a step up from the rail orb. */}
      <OviOrb size={{ cssVar: 'var(--space-6)' }} state="idle" />
      <Text variant="largeTitle" as="h1" style={{ margin: 0 }}>
        {strings.closet.emptySignature}
      </Text>
      <div style={actionStyle}>
        <Button variant="primary" onClick={onAddPhoto}>
          {strings.closet.addCta}
        </Button>
      </div>
    </div>
  );
}

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 'var(--space-6)',
  paddingBlock: 'var(--space-16)',
  maxWidth: 'var(--feed-col)',
};

const actionStyle: CSSProperties = {
  display: 'flex',
};
