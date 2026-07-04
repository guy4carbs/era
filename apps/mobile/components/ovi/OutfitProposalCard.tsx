/**
 * OutfitProposalCard — a look Ovi proposed, rendered from real closet cutouts.
 *
 * A mini-collage (up to four resolved cutouts, via the shared {@link Collage}),
 * the look's name + occasion, and Ovi's one-line rationale, over a Save / Not
 * today action pair. Save fires a light-impact haptic; a pass fires a selection
 * tick. While a save or pass is in flight the actions disable; once saved the
 * card holds a quiet "saved" state (the parent clears a passed card). The card
 * eases in gently and pins static under reduced motion.
 */
import { motion as motionTokens, radii, spacing, typeRamp } from '@era/tokens';
import type { ProposedOutfit } from '@era/core/ovi';
import { strings } from '@era/core/strings';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { Collage } from '@/components/design/Collage';
import { useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

/** The lifecycle of a single proposal card as its actions resolve. */
export type ProposalStatus = 'idle' | 'saving' | 'saved';

interface OutfitProposalCardProps {
  readonly outfit: ProposedOutfit;
  /** Cutout URLs already resolved from the outfit's itemIds (order preserved). */
  readonly images: readonly string[];
  readonly status: ProposalStatus;
  readonly onSave: () => void;
  readonly onReject: () => void;
}

export function OutfitProposalCard({
  outfit,
  images,
  status,
  onSave,
  onReject,
}: OutfitProposalCardProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotionSafe();
  const saved = status === 'saved';
  const busy = status === 'saving';

  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(motionTokens.durations.minMs)}
      accessibilityLabel={outfit.name}
      style={[
        styles.card,
        {
          borderRadius: radii.card,
          backgroundColor: colors.surface,
          borderColor: colors.hairline,
        },
      ]}
    >
      <View style={styles.collage}>
        <Collage cover={null} images={images} />
      </View>

      <View style={styles.meta}>
        <Text
          numberOfLines={1}
          style={{
            color: colors.text,
            fontSize: typeRamp.title3.pt,
            lineHeight: typeRamp.title3.lineHeight,
            fontWeight: '600',
          }}
        >
          {outfit.name}
        </Text>
        {outfit.occasion ? (
          <Text
            numberOfLines={1}
            style={{
              color: colors.secondary,
              fontSize: typeRamp.footnote.pt,
              lineHeight: typeRamp.footnote.lineHeight,
            }}
          >
            {outfit.occasion}
          </Text>
        ) : null}
        {outfit.rationale ? (
          <Text
            style={{
              color: colors.text,
              fontSize: typeRamp.subhead.pt,
              lineHeight: typeRamp.subhead.lineHeight,
            }}
          >
            {outfit.rationale}
          </Text>
        ) : null}
      </View>

      {saved ? (
        <Text
          accessibilityRole="text"
          style={{
            color: colors.secondary,
            fontSize: typeRamp.footnote.pt,
            lineHeight: typeRamp.footnote.lineHeight,
          }}
        >
          {strings.ovi.accepted}
        </Text>
      ) : (
        <View style={styles.actions}>
          <Button
            label={strings.ovi.outfitAcceptCta}
            variant="primary"
            haptic
            disabled={busy}
            onPress={onSave}
            style={styles.action}
          />
          <Button
            label={strings.ovi.outfitRejectCta}
            variant="secondary"
            disabled={busy}
            onPress={onReject}
            style={styles.action}
          />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s3,
    padding: spacing.s3,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
  },
  collage: {
    width: '100%',
    aspectRatio: 1,
  },
  meta: {
    gap: spacing.s1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.s2,
  },
  action: {
    flex: 1,
  },
});
