/**
 * WoreItButton — the daily-loop affordance that logs a look as worn today.
 *
 * One token-styled action ("Wore it today") that posts to `/api/wear-logs` and,
 * on a real 201, fires the `wear_logged` funnel event. A press is optimistic: it
 * flips to the confirmed line immediately with a selection tick, then reverts (a
 * quiet error toast) if the write fails. Once confirmed it stays confirmed for
 * the session — the button owns the guard against double-logging the same card.
 * The confirmed state eases in gently and pins static under reduced motion.
 *
 * A proposal has no outfit id, so the Feed "Today" card logs by `itemIds`; a
 * saved-outfit surface can pass `outfitId` instead.
 */
import { layout, motion as motionTokens, typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { analytics } from '@/lib/analytics';
import { useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

import { logWear } from './api';

/** The lifecycle of a single wear action — optimistic, so it skips a pending beat. */
type WearStatus = 'idle' | 'confirmed';

interface WoreItButtonProps {
  /** Item ids of the look being logged — used when there is no saved outfit id. */
  readonly itemIds: readonly string[];
  /** A saved outfit's id, when logging a persisted look rather than a proposal. */
  readonly outfitId?: string;
  /** The surface firing the event, recorded as `wear_logged { via }`. */
  readonly via: string;
  /** Surface a toast line to the parent (which owns the on-screen Toast). */
  readonly onToast: (message: string) => void;
  /**
   * Coarse coordinates for the server's weather snapshot — forwarded ONLY when
   * the surface already holds them (weatherless otherwise; never a new prompt).
   */
  readonly lat?: number;
  readonly lon?: number;
  /**
   * Fired after a real 201, so a surface showing wear stats (e.g. item detail)
   * can optimistically bump its count and refetch. Optional — the Feed card
   * that only toasts leaves it unset.
   */
  readonly onLogged?: () => void;
}

export function WoreItButton({ itemIds, outfitId, via, onToast, lat, lon, onLogged }: WoreItButtonProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotionSafe();
  const [status, setStatus] = useState<WearStatus>('idle');

  const onWore = () => {
    // Session guard: only the first real press logs; a confirmed card is done.
    if (status !== 'idle') return;

    void Haptics.selectionAsync();
    setStatus('confirmed'); // Optimistic — the loop should feel instant.

    void logWear({ outfitId, itemIds, lat, lon })
      .then(() => {
        // Only a real 201 counts toward the funnel.
        analytics.track('wear_logged', { via });
        onToast(strings.outfits.wearLogged);
        // Let a stats surface reconcile (bump + refetch) off the confirmed log.
        onLogged?.();
      })
      .catch(() => {
        // Graceful failure: revert so the user can try again, honestly toasted.
        setStatus('idle');
        onToast(strings.errors.generic);
      });
  };

  if (status === 'confirmed') {
    return (
      <Animated.View
        entering={reduced ? undefined : FadeIn.duration(motionTokens.durations.minMs)}
        style={styles.confirmed}
      >
        <Text
          accessibilityRole="text"
          style={{
            color: colors.accent,
            fontSize: typeRamp.footnote.pt,
            lineHeight: typeRamp.footnote.lineHeight,
            fontWeight: '600',
          }}
        >
          {strings.ovi.woreItConfirmed}
        </Text>
      </Animated.View>
    );
  }

  return (
    <Button
      label={strings.ovi.woreItCta}
      variant="secondary"
      onPress={onWore}
    />
  );
}

const styles = StyleSheet.create({
  // Match the button's touch target so the row height holds when it confirms.
  confirmed: {
    minHeight: layout.touchTarget.ios,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
