'use client';

import { type CSSProperties } from 'react';
import { boxShadows } from '@era/tokens';

export interface CollageProps {
  /** A composed cover, preferred when present. */
  cover: string | null;
  /** Up to four member thumbnails, composed into a 2x2 fallback collage. */
  thumbs: string[];
  alt: string;
}

const frameStyle: CSSProperties = {
  position: 'relative',
  aspectRatio: '4 / 5',
  width: '100%',
  overflow: 'hidden',
  borderRadius: 'var(--radius-card)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-hairline)',
  boxShadow: boxShadows.e2,
};

const coverImgStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
};

const cellImgStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  display: 'block',
  padding: 'var(--space-2)',
};

/**
 * An outfit or era cover: the composed cover when there is one, else a small
 * grid of member thumbnails (1 fills, 2 splits, 3–4 form a 2x2). Empty renders a
 * bare surface. Always a 4:5 frame so cards line up.
 */
export function Collage({ cover, thumbs, alt }: CollageProps) {
  if (cover) {
    return (
      <div style={frameStyle}>
        <img src={cover} alt={alt} style={coverImgStyle} />
      </div>
    );
  }

  const cells = thumbs.slice(0, 4);
  const columns = cells.length <= 1 ? 1 : 2;

  return (
    <div style={frameStyle}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: '1px',
          width: '100%',
          height: '100%',
          background: 'var(--color-hairline)',
        }}
      >
        {cells.map((url, index) => (
          <div key={`${url}-${index}`} style={{ background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={url} alt="" style={cellImgStyle} />
          </div>
        ))}
      </div>
    </div>
  );
}
