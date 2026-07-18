'use client';

import { useState, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken, boxShadows } from '@era/tokens';
import { strings } from '@era/core/strings';
import type { OviIntent, ProposedOutfit } from '@era/core/ovi';
import { transitionFor } from '../../lib/motion';
import { analytics, trackFirstOnce } from '../../lib/analytics';
import { useSession } from '../../lib/auth-client';
import { Card } from '../Card';
import { Button } from '../Button';
import { Text } from '../Text';
import { acceptOutfit, logWear, rejectOutfit } from './ovi-actions';
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
  /**
   * When set, the saved state offers a "Wore it today" affordance that logs the
   * outfit as worn and fires `wear_logged` with this surface as `via`. Omitted on
   * surfaces that shouldn't close the daily-wear loop (e.g. the chat sheet).
   */
  wearSurface?: string;
  /**
   * Coarse coordinates the surface already resolved (e.g. the Today card's
   * weather lookup), forwarded to the wear log so the server captures a weather
   * snapshot. Never prompted for here — passed only when the surface already has
   * them, otherwise the wear is logged weatherless.
   */
  wearLocation?: { lat: number; lon: number } | null;
}

type Status = 'idle' | 'saving' | 'saved';
type WearStatus = 'idle' | 'logging' | 'logged';

const wrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  padding: 'var(--space-4)',
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

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-3)',
};

const savedRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
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
  wearSurface,
  wearLocation,
}: OutfitCardProps) {
  const reduced = useReducedMotion();
  const { data: session } = useSession();
  const [status, setStatus] = useState<Status>('idle');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [wearStatus, setWearStatus] = useState<WearStatus>('idle');

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
      // First saved look (from Ovi's proposal) — activation moment, once per user.
      trackFirstOnce('first_outfit_saved', session?.user?.id, { via: 'ovi' });
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

  async function handleWoreIt() {
    // Local guard: never double-log the same card in one session.
    if (!savedId || wearSurface === undefined || wearStatus !== 'idle') return;
    setWearStatus('logging');
    const logged = await logWear({
      outfitId: savedId,
      lat: wearLocation?.lat ?? null,
      lon: wearLocation?.lon ?? null,
    });
    if (logged) {
      setWearStatus('logged');
      // Fire the funnel event only on a real 201 — the wear actually landed.
      analytics.track('wear_logged', { via: wearSurface });
    } else {
      // Revert so the wearer can retry, and surface the honest failure line
      // through the parent's toast (Gauge LOW: don't fail silently).
      setWearStatus('idle');
      onSaved(strings.wear.logFailed);
    }
  }

  const canOpen = status === 'saved' && savedId !== null && onOpen !== undefined;
  const canWear = status === 'saved' && savedId !== null && wearSurface !== undefined;

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
          {weatherLead ? (
            <Text variant="caption" size="footnote" as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>
              {weatherLead}
            </Text>
          ) : null}

          <div>
            {/* outfit.name is an era/outfit name — oviAccent per mapping */}
            <Text variant="oviAccent" as="p" style={{ margin: 0, color: 'var(--color-text)' }}>
              {outfit.name}
            </Text>
            {outfit.occasion ? (
              <Text variant="caption" size="footnote" as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)', textTransform: 'capitalize' }}>
                {outfit.occasion}
              </Text>
            ) : null}
          </div>

          <div style={gridStyle}>
            {tiles.map((tile) => (
              <CutoutTile key={tile.id} url={tile.url} name={tile.name} />
            ))}
          </div>

          {outfit.rationale ? (
            <Text variant="caption" size="footnote" as="p" style={{ margin: 0, color: 'var(--color-text)' }}>
              {outfit.rationale}
            </Text>
          ) : null}

          {status === 'saved' ? (
            <>
              <div style={savedRowStyle}>
                <Text variant="caption" size="footnote" weight={600} as="span" style={{ color: 'var(--color-accent)' }}>
                  {strings.ovi.accepted}
                </Text>
                {canOpen ? (
                  <Text variant="caption" size="footnote" as="span" aria-hidden="true">
                    Open →
                  </Text>
                ) : null}
              </div>
              {canWear ? (
                wearStatus === 'logged' ? (
                  <Text variant="caption" size="footnote" weight={600} as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>
                    {strings.ovi.woreItConfirmed}
                  </Text>
                ) : (
                  <div style={actionsStyle}>
                    <Button
                      variant="secondary"
                      disabled={wearStatus === 'logging'}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleWoreIt();
                      }}
                    >
                      {strings.ovi.woreItCta}
                    </Button>
                  </div>
                )
              ) : null}
            </>
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
