import { type CSSProperties } from 'react';
import { typeRamp } from '@era/tokens';

export interface PaletteSwatchesProps {
  /** Hex colors to show, in order — read from `ARCHETYPES` (never duplicated in content). */
  readonly hexes: readonly string[];
  /** Show the hex value under each swatch. Off for the compact hub strip, on for style pages. */
  readonly showLabels?: boolean;
  /** Swatch edge length in px (default 44). */
  readonly size?: number;
  /** Accessible name for the swatch row (e.g. "Quiet Luxe palette"). */
  readonly label: string;
}

/**
 * A row of palette swatches — color blocks with optional hex labels — rendered
 * straight from an archetype's `anchorHexes`/`accentHexes`. Hex data lives ONLY
 * in `ARCHETYPES` (`@era/core/quiz`); this component just paints what it is given,
 * so the palette can never drift from the quiz's source of truth. The row is
 * exposed as a single labelled image to assistive tech. Server Component.
 */
export function PaletteSwatches({ hexes, showLabels = false, size = 44, label }: PaletteSwatchesProps) {
  if (hexes.length === 0) {
    return null;
  }
  return (
    <div style={rowStyle} role="img" aria-label={`${label}: ${hexes.join(', ')}`}>
      {hexes.map((hex, index) => (
        <div key={`${hex}-${index}`} style={swatchCellStyle}>
          <span
            aria-hidden="true"
            style={{
              ...swatchStyle,
              width: `${size}px`,
              height: `${size}px`,
              background: hex,
            }}
          />
          {showLabels ? (
            <span aria-hidden="true" style={hexLabelStyle}>
              {hex.toUpperCase()}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
};

const swatchCellStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-1)',
};

const swatchStyle: CSSProperties = {
  display: 'block',
  borderRadius: 'var(--radius-chip)',
  border: '1px solid var(--color-hairline)',
};

const hexLabelStyle: CSSProperties = {
  fontSize: typeRamp.caption.rem,
  lineHeight: `${typeRamp.caption.lineHeight}px`,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  color: 'var(--color-secondary)',
};
