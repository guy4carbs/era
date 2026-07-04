'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import type { ProposedOutfit } from '@era/core/ovi';
import { useSession } from '../../lib/auth-client';
import { OutfitCard } from './OutfitCard';
import { OviToast, OVI_TOAST_MS } from './OviToast';
import { fetchOviToday } from './ovi-actions';
import { useOviChat } from './OviChatProvider';
import type { OviWeather } from './types';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; reply: string; outfit: ProposedOutfit | null; weather: OviWeather | null };

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.title2.rem,
  lineHeight: `${typeRamp.title2.lineHeight}px`,
  fontWeight: 700,
};

const bodyStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary-strong)',
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
};

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
 * The Feed's daily hero: Ovi's weather-aware suggestion for today. On mount it
 * asks for a coarse location (rounded before it ever leaves the device), fetches
 * today's look, and renders it as the same tappable OutfitCard the chat uses —
 * Save persists it, Not today records a soft reject and retreats gracefully.
 * A sparse closet (or a denied location) still resolves to an honest state.
 */
export function TodayCard() {
  const { data: session, isPending } = useSession();
  const { itemsById } = useOviChat();
  const router = useRouter();

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [dismissed, setDismissed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (isPending || !session) return;
    let active = true;
    void (async () => {
      const location = await getCoarseLocation();
      const res = await fetchOviToday(location);
      if (!active) return;
      setState(
        res
          ? { status: 'ready', reply: res.reply, outfit: res.outfit, weather: res.weather }
          : { status: 'error' },
      );
    })();
    return () => {
      active = false;
    };
  }, [isPending, session]);

  useEffect(() => {
    if (!toast) return;
    const handle = setTimeout(() => setToast(null), OVI_TOAST_MS);
    return () => clearTimeout(handle);
  }, [toast]);

  // Signed out or the fetch failed hard: the hero simply doesn't appear.
  if (!session || state.status === 'error') return null;

  if (state.status === 'loading') {
    return (
      <section style={sectionStyle} aria-busy="true">
        <h2 style={titleStyle}>{strings.ovi.todayTitle}</h2>
        <p style={bodyStyle}>{strings.ovi.thinking}</p>
      </section>
    );
  }

  const hasOutfit = state.outfit !== null && !dismissed;

  return (
    <section style={sectionStyle}>
      <h2 style={titleStyle}>{strings.ovi.todayTitle}</h2>

      {hasOutfit ? (
        <>
          <p style={bodyStyle}>{state.reply}</p>
          <AnimatePresence>
            {state.outfit ? (
              <OutfitCard
                outfit={state.outfit}
                itemsById={itemsById}
                intent="today"
                weatherLead={
                  state.weather
                    ? strings.ovi.weatherLine(state.weather.tempC, state.weather.condition)
                    : null
                }
                onSaved={setToast}
                onDismissed={() => {
                  setToast(strings.ovi.rejected);
                  setDismissed(true);
                }}
                onOpen={(outfitId) => router.push(`/design/canvas?outfit=${outfitId}`)}
              />
            ) : null}
          </AnimatePresence>
        </>
      ) : (
        <p style={bodyStyle}>
          {dismissed ? strings.ovi.suggestionDeclined : strings.ovi.todayEmpty}
        </p>
      )}

      <AnimatePresence>{toast ? <OviToast message={toast} /> : null}</AnimatePresence>
    </section>
  );
}
