/**
 * ShareFrame — the fixed 360×640 (9:16) canvas every share card is built on.
 *
 * Deliberately theme-independent: it always paints the LIGHT (warm cream) palette
 * so a shared image reads the same whether the sender runs the app in light or
 * dark. `view-shot` resizes this logical box to the exact 1080×1920 pixels at
 * capture time, so the layout is authored once at 360×640. The captured View
 * carries the forwarded `viewRef` and `collapsable={false}` (Android won't capture
 * a collapsed View otherwise). Content leads; a quiet ever-present ERA wordmark +
 * `era.style` footnote sit centred at the bottom as the watermark.
 */
import { strings } from '@era/core/strings';
import { palette, spacing, typeRamp } from '@era/tokens';
import type { ReactNode, RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';

/** Logical authoring size; captured and resized to the Story pixel size. */
export const SHARE_LOGICAL_WIDTH = 360;
export const SHARE_LOGICAL_HEIGHT = 640;

/** The forced-light palette every share card renders on. */
const CREAM = palette.light;

/** Wordmark tracking — the recap card's 0.14em over the subhead size, in px. */
const WORDMARK_LETTERSPACE = Math.round(typeRamp.subhead.pt * 0.14 * 10) / 10;

interface ShareFrameProps {
  readonly viewRef: RefObject<View | null>;
  readonly children: ReactNode;
}

export function ShareFrame({ viewRef, children }: ShareFrameProps) {
  return (
    <View ref={viewRef} collapsable={false} style={styles.frame}>
      <View style={styles.content}>{children}</View>
      <View style={styles.watermark}>
        <Text variant="ui" weight={700} color={CREAM.text} style={styles.wordmark}>
          ERA
        </Text>
        <Text variant="caption" color={CREAM.secondaryStrong} style={styles.domain}>
          {strings.share.watermarkDomain}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: SHARE_LOGICAL_WIDTH,
    height: SHARE_LOGICAL_HEIGHT,
    backgroundColor: CREAM.bg,
    paddingHorizontal: spacing.s8,
    paddingTop: spacing.s12,
    // Bottom breathes like the sides do — the watermark footer shouldn't sit
    // tighter than the rest of the frame (Axiom N2).
    paddingBottom: spacing.s8,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.s6,
  },
  watermark: {
    alignItems: 'center',
    gap: spacing.s1,
  },
  wordmark: {
    opacity: 0.45,
    letterSpacing: WORDMARK_LETTERSPACE,
    textTransform: 'uppercase',
  },
  domain: {
    opacity: 0.7,
    letterSpacing: 0.5,
  },
});
