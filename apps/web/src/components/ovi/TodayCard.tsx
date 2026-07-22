'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { AnimatePresence } from 'motion/react';
import { strings } from '@era/core/strings';
import type { ProposedOutfit } from '@era/core/ovi';
import { useSession } from '../../lib/auth-client';
import { localToday } from '../../lib/local-date';
import { Text } from '../Text';
import { OviToast, TOAST_DISMISS_MS } from './OviToast';
import { RevealStage } from './RevealStage';
import { fetchOviToday } from './ovi-actions';
import { useOviChat } from './OviChatProvider';
import type { OviWeather } from './types';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      outfit: ProposedOutfit | null;
      weather: OviWeather | null;
      revealLine: string | null;
    };

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

/** localStorage key holding the LOCAL date the reveal was last seen (YYYY-MM-DD). */
const REVEAL_SEEN_KEY = 'era-reveal-seen';

/** SSR-safe read of the last-seen reveal date; null off-DOM or on any failure. */
function readRevealSeen(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(REVEAL_SEEN_KEY);
  } catch {
    return null;
  }
}

/** SSR-safe write of today's date as the last-seen reveal day. Best-effort. */
function markRevealSeen(day: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(REVEAL_SEEN_KEY, day);
  } catch {
    // Private mode / disabled storage: the reveal just re-stages next mount.
  }
}

/** Round a coordinate to ~1 decimal (~11 km) before it leaves the device. */
function coarse(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Resolve a coarse location, or null when geolocation is denied/unavailable. */
function getCoarseLocation(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({ lat: coarse(position.coords.latitude), lon: coarse(position.coords.longitude) }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
  });
}

/**
 * The Feed's daily hero — Era's signature Today ritual (D9). On mount it resolves
 * a coarse location (rounded before it leaves the device), fetches today's look,
 * and hands it to the {@link RevealStage}. The FIRST view of a given local day
 * plays the staged assembly (cutouts landing one by one, then the settle); every
 * later view that day opens straight on the composed card (`initiallySettled`),
 * so there is ONE Today surface, not two. The once-per-day gate lives in
 * `localStorage` (`era-reveal-seen` = the local YYYY-MM-DD), marked after the
 * sequence settles or is skipped.
 *
 * A sparse closet (no look) or a hard fetch failure still resolves to an honest
 * state: the hero simply doesn't render the stage.
 */
export function TodayCard() {
  const { data: session, isPending } = useSession();
  const { itemsById } = useOviChat();

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [dismissed, setDismissed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  // Whether today's reveal has already been seen — decides staged vs. settled.
  // Read once on mount (SSR-safe); the stage marks it after it completes.
  const [alreadySeen, setAlreadySeen] = useState(false);

  useEffect(() => {
    setAlreadySeen(readRevealSeen() === localToday());
  }, []);

  useEffect(() => {
    if (isPending || !session) return;
    let active = true;
    void (async () => {
      const coords = await getCoarseLocation();
      if (active) setLocation(coords);
      const res = await fetchOviToday(coords);
      if (!active) return;
      setState(
        res
          ? {
              status: 'ready',
              outfit: res.outfit,
              weather: res.weather,
              revealLine: res.revealLine,
            }
          : { status: 'error' },
      );
    })();
    return () => {
      active = false;
    };
  }, [isPending, session]);

  useEffect(() => {
    if (!toast) return;
    const handle = setTimeout(() => setToast(null), TOAST_DISMISS_MS);
    return () => clearTimeout(handle);
  }, [toast]);

  // Signed out or the fetch failed hard: the hero simply doesn't appear.
  if (!session || state.status === 'error') return null;

  if (state.status === 'loading') {
    return (
      <section style={sectionStyle} aria-busy="true">
        <Text variant="largeTitle" as="h2">
          {strings.reveal.title}
        </Text>
        <Text variant="oviAccent" size="subhead" as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>
          {strings.ovi.thinking}
        </Text>
      </section>
    );
  }

  const hasOutfit = state.outfit !== null && !dismissed;

  return (
    <section style={sectionStyle}>
      {hasOutfit && state.outfit ? (
        <AnimatePresence>
          <RevealStage
            outfit={state.outfit}
            itemsById={itemsById}
            revealLine={state.revealLine}
            weather={state.weather}
            initiallySettled={alreadySeen}
            wearLocation={location}
            onRevealComplete={() => markRevealSeen(localToday())}
            onToast={setToast}
            onDismissed={() => setDismissed(true)}
          />
        </AnimatePresence>
      ) : (
        <>
          <Text variant="largeTitle" as="h2">
            {strings.reveal.title}
          </Text>
          <Text variant="body" size="subhead" as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>
            {dismissed ? strings.ovi.suggestionDeclined : strings.ovi.todayEmpty}
          </Text>
        </>
      )}

      <AnimatePresence>{toast ? <OviToast message={toast} /> : null}</AnimatePresence>
    </section>
  );
}
