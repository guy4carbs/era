'use client';

import { useState, type CSSProperties } from 'react';
import { sheen } from '@era/tokens';

export interface QuizImageProps {
  /** Basename under `/public/quiz` — resolved to `/quiz/<imageKey>.jpg`. */
  imageKey?: string;
  /** Decorative by default: the enclosing option button carries the label. */
  alt?: string;
}

/**
 * Covers its positioned parent with the option's photo. A token-styled accent
 * gradient sits permanently underneath, so a missing or failed image degrades
 * gracefully to a tasteful placeholder rather than a broken-image glyph.
 */
const fallbackStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: `linear-gradient(${sheen.angleDeg}deg, color-mix(in srgb, var(--color-accent) 45%, var(--color-surface)), var(--color-surface))`,
};

const imgStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
};

export function QuizImage({ imageKey, alt = '' }: QuizImageProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(imageKey) && !failed;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={fallbackStyle} aria-hidden="true" />
      {showImage ? (
        <img
          src={`/quiz/${imageKey}.jpg`}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          style={imgStyle}
        />
      ) : null}
    </div>
  );
}
