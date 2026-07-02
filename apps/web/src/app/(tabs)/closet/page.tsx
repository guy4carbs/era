import { type CSSProperties } from 'react';
import { typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { Button } from '../../../components';

const screenStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
  paddingBlock: 'var(--space-8)',
  alignItems: 'flex-start',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.title1.rem,
  lineHeight: `${typeRamp.title1.lineHeight}px`,
  fontWeight: 700,
};

const emptyStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary)',
  fontSize: typeRamp.body.rem,
};

export default function ClosetPage() {
  return (
    <main style={screenStyle}>
      <h1 style={titleStyle}>Closet</h1>
      <p style={emptyStyle}>{strings.closet.empty}</p>
      {/* Stub: wiring lands with the add-item flow (Phase 1). */}
      <Button variant="primary">Add your first piece</Button>
    </main>
  );
}
