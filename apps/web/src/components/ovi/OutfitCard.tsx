'use client';

import { useState, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken, typeRamp, boxShadows } from '@era/tokens';
import { strings } from '@era/core/strings';
import type { OviIntent, ProposedOutfit } from '@era/core/ovi';
import { transitionFor } from '../../lib/motion';
import { Card } from '../Card';
import { Button } from '../Button';
import { acceptOutfit, rejectOutfit } from './ovi-actions';
import type { ItemsById } from './types';

export interface OutfitCardProps {
  /** The look Ovi proposed — its item ids resolve against `itemsById`. */
  outfit: ProposedOutfit;
  /** Cutout lookup for the outfit's pieces (from `GET /api/items`). */
  itemsById: ItemsById;
  /** The intent that produced the look, recorded with accept/reject. */
  intent?: OviIntent;
  /** Optional weather lead line shown above the look (from `weatherLine`). */
  weatherLead?: string | null;
  /** Toast text the parent should surface after a save / an error. */
  onSaved: (message: string) => void;
  /** Fired after a dismissal so the parent can remove the card. */
  onDismissed: () => void;
  /** Opens the saved outfit in the canvas (parent owns navigation). */
  onOpen?: (outfitId: string) => void;
}

type Status = 'idle' | 'saving' | 'saved';

const wrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  padding: 'var(--space-4)',
};

const weatherLeadStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

const nameStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.title3.rem,
  lineHeight: `${typeRamp.title3.lineHeight}px`,
  fontWeight: 700,
  color: 'var(--color-text)',
};

const occasionStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.footnote.rem,
  color: 'var(--color-secondary-strong)',
  textTransform: 'capitalize',
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
  gap: 'var(--space-2)',
};

const tileStyle: CSSProperties = {
  position: 'relative',
  aspectRatio: '4 / 5',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-card)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-hairline)',
  boxShadow: boxShadows.e1,
};

const tileImageStyle: CSSProperties = {
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
};

const rationaleStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-text)',
};

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-3)',
};

const savedRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
  fontSize: typeRamp.footnote.rem,
  fontWeight: 600,
  color: 'var(--color-accent)',
};

/** A single cutout tile on cream/charcoal, mirroring the closet item frame. */
function CutoutTile({ url, name }: { url: string | null; name: string }) {
  return (
    <div style={tileStyle}>
      {url ? <img src={url} alt={name} style={tileImageStyle} /> : null}
    </div>
  );
}

/**
 * The payoff: a tappable look built from the wearer's real cutouts. Shows a
 * mini-collage of the outfit's pieces, its name/occasion, Ovi's rationale, and
 * two actions — Save (persists the outfit + records the accept) and Not today
 * (records a soft reject, then the parent dismisses the card). Once saved, the
 * whole card becomes a tap target that opens the look in the canvas.
 */
export function OutfitCard({
  outfit,
  itemsById,
  intent,
  weatherLead,
  onSaved,
  onDismissed,
  onOpen,
}: OutfitCardProps) {
  const reduced = useReducedMotion();
  const [status, setStatus] = useState<Status>('idle');
  const [savedId, setSavedId] = useState<string | null>(null);

  const tiles = outfit.itemIds.map((id) => {
    const info = itemsById.get(id);
    return { id, url: info?.displayUrl ?? null, name: info?.name ?? '' };
  });

  async function handleSave() {
    if (status !== 'idle') return;
    setStatus('saving');
    const saved = await acceptOutfit(outfit, intent);
    if (saved) {
      setSavedId(saved.id);
      setStatus('saved');
      onSaved(strings.ovi.accepted);
    } else {
      setStatus('idle');
      onSaved(strings.errors.generic);
    }
  }

  function handleDismiss() {
    // Fire-and-forget training signal; the dismissal always feels instant.
    void rejectOutfit(outfit, intent);
    onDismissed();
  }

  const canOpen = status === 'saved' && savedId !== null && onOpen !== undefined;

  return (
    <motion.div
      role="group"
      aria-label={strings.ovi.proposalIntro(outfit.occasion)}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
      transition={transitionFor(motionToken.springs.gentle, reduced)}
    >
      <Card
        interactive={canOpen}
        onClick={canOpen && savedId ? () => onOpen?.(savedId) : undefined}
      >
        <div style={wrapStyle}>
          {weatherLead ? <p style={weatherLeadStyle}>{weatherLead}</p> : null}

          <div>
            <p style={nameStyle}>{outfit.name}</p>
            {outfit.occasion ? <p style={occasionStyle}>{outfit.occasion}</p> : null}
          </div>

          <div style={gridStyle}>
            {tiles.map((tile) => (
              <CutoutTile key={tile.id} url={tile.url} name={tile.name} />
            ))}
          </div>

          {outfit.rationale ? <p style={rationaleStyle}>{outfit.rationale}</p> : null}

          {status === 'saved' ? (
            <div style={savedRowStyle}>
              <span>{strings.ovi.accepted}</span>
              {canOpen ? <span aria-hidden="true">Open →</span> : null}
            </div>
          ) : (
            <div style={actionsStyle}>
              <Button
                variant="primary"
                disabled={status === 'saving'}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleSave();
                }}
              >
                {strings.ovi.outfitAcceptCta}
              </Button>
              <Button
                variant="ghost"
                disabled={status === 'saving'}
                onClick={(event) => {
                  event.stopPropagation();
                  handleDismiss();
                }}
              >
                {strings.ovi.outfitRejectCta}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
