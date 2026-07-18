'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { strings } from '@era/core/strings';
import { Text } from '../Text';
import { PlacedItemView } from './PlacedItemView';
import type { Guide } from './snapping';
import { STAGE_ASPECT, type PlacedItem } from './types';

export interface CanvasStageProps {
  placed: PlacedItem[];
  selectedId: string | null;
  onSelect: (itemId: string | null) => void;
  onCommit: (itemId: string, posX: number, posY: number) => void;
}

const areaStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  paddingInline: 'var(--space-4)',
};

const paperStyle: CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius-sheet)',
  border: '1px solid var(--color-hairline)',
};


/** A thin accent guide line drawn while a piece snaps. */
function GuideLine({ guide, width, height }: { guide: Guide; width: number; height: number }) {
  const base: CSSProperties = {
    position: 'absolute',
    background: 'color-mix(in srgb, var(--color-accent) 60%, transparent)',
    pointerEvents: 'none',
    zIndex: 9999,
  };
  const style: CSSProperties =
    guide.axis === 'x'
      ? { ...base, left: guide.at * width, top: 0, width: 1, height }
      : { ...base, top: guide.at * height, left: 0, height: 1, width };
  return <span aria-hidden="true" style={style} />;
}

/**
 * The outfit "paper": a 4:5 surface, sized in JS to fit its area exactly so the
 * normalized transforms map to precise pixels (and compose 1:1 into the cover).
 * Pieces stack by layerOrder; snap guides render on top during a drag; tapping
 * the bare paper clears the selection.
 */
export function CanvasStage({ placed, selectedId, onSelect, onCommit }: CanvasStageProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [guides, setGuides] = useState<Guide[]>([]);

  useEffect(() => {
    const node = areaRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setArea({ w: rect.width, h: rect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const width = area.w > 0 && area.h > 0 ? Math.min(area.w, area.h * STAGE_ASPECT) : 0;
  const height = width / STAGE_ASPECT;

  const centers = useMemo(
    () => placed.map((p) => ({ itemId: p.itemId, posX: p.posX, posY: p.posY })),
    [placed],
  );

  return (
    <div ref={areaRef} style={areaStyle}>
      <div
        style={{ ...paperStyle, width, height }}
        onClick={(event) => {
          if (event.target === event.currentTarget) onSelect(null);
        }}
      >
        {placed.length === 0 ? (
          <Text
            variant="body"
            as="p"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: 'var(--space-8)',
              margin: 0,
              color: 'var(--color-secondary-strong)',
              pointerEvents: 'none',
            }}
          >
            {strings.design.canvasEmptyHint}
          </Text>
        ) : null}

        {width > 0
          ? placed.map((piece) => (
              <PlacedItemView
                key={piece.itemId}
                piece={piece}
                selected={piece.itemId === selectedId}
                stageWidth={width}
                stageHeight={height}
                others={centers.filter((c) => c.itemId !== piece.itemId)}
                onSelect={() => onSelect(piece.itemId)}
                onCommit={(posX, posY) => onCommit(piece.itemId, posX, posY)}
                onGuides={setGuides}
              />
            ))
          : null}

        {guides.map((guide) => (
          <GuideLine key={`${guide.axis}-${guide.at}`} guide={guide} width={width} height={height} />
        ))}
      </div>
    </div>
  );
}
