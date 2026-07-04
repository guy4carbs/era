import Link from 'next/link';
import { type CSSProperties } from 'react';
import { typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { Button } from '../../../components';

const screenStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
  paddingBlock: 'var(--space-8)',
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

export default function DesignPage() {
  return (
    <main style={screenStyle}>
      <h1 style={titleStyle}>Design</h1>
      <p style={emptyStyle}>{strings.outfits.emptyDesign}</p>
      <Link href="/quiz" style={{ alignSelf: 'start', textDecoration: 'none' }}>
        <Button variant="secondary">Take the style quiz</Button>
      </Link>
    </main>
  );
}
