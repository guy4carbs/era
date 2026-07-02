'use client';

import { type CSSProperties } from 'react';
import { typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { Card } from '../Card';

export interface PhotoPickerProps {
  /** Fires with the chosen image File (from camera capture or the library). */
  onPick: (file: File) => void;
}

const gridStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-4)',
  gridTemplateColumns: '1fr 1fr',
  width: '100%',
};

const labelStyle: CSSProperties = {
  display: 'block',
  cursor: 'pointer',
};

const hiddenInputStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

const tileStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-2)',
  minHeight: 'var(--space-16)',
  padding: 'var(--space-6)',
  textAlign: 'center',
};

const glyphStyle: CSSProperties = {
  fontSize: typeRamp.title1.rem,
  lineHeight: 1,
};

const captionStyle: CSSProperties = {
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  fontWeight: 600,
  color: 'var(--color-text)',
};

/**
 * The add-flow entry: two big tiles over one image input each. "Take photo"
 * asks for the rear camera via `capture`; "Choose photo" opens the library.
 * Each tile is a real <label> wrapping a visually-hidden file input, so the
 * whole card is a native, accessible trigger.
 */
export function PhotoPicker({ onPick }: PhotoPickerProps) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so re-picking the same file still fires change.
    event.target.value = '';
    if (file) onPick(file);
  }

  return (
    <div style={gridStyle}>
      <label style={labelStyle}>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          style={hiddenInputStyle}
          onChange={handleChange}
        />
        <Card interactive>
          <div style={tileStyle}>
            <span style={glyphStyle} aria-hidden="true">
              ◉
            </span>
            <span style={captionStyle}>{strings.closet.takePhoto}</span>
          </div>
        </Card>
      </label>

      <label style={labelStyle}>
        <input type="file" accept="image/*" style={hiddenInputStyle} onChange={handleChange} />
        <Card interactive>
          <div style={tileStyle}>
            <span style={glyphStyle} aria-hidden="true">
              ▦
            </span>
            <span style={captionStyle}>{strings.closet.pickPhoto}</span>
          </div>
        </Card>
      </label>
    </div>
  );
}
