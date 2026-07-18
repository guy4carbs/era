/**
 * GapsHero — the honest "what am I missing?" band atop the Shop tab.
 *
 * Renders the engine's genuine wardrobe gaps (already capped at ≤5, so every one
 * shows — no "show more"). Each gap is one honest sentence built from its own
 * numbers ({@link strings.shop.gaps.reason}), an outfit-unlock badge, and a "Fill
 * this gap" button that drops the user into a pre-filtered Shop search for that
 * category. A covered closet returns no gaps, so this collapses to the warm empty
 * line — never a manufactured nudge.
 *
 * Restraint is the whole point: quiet, tokens-only, no motion of its own (the CTA
 * borrows Button's reduced-motion-aware press). Safe-area is owned by the Shop
 * screen's SafeAreaView; this lives inside the list header, so it needs none.
 */
import type { WardrobeGap } from '@era/core/shop';
import { strings } from '@era/core/strings';
import { radii, spacing } from '@era/tokens';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { useTheme } from '@/lib/theme';

interface GapsHeroProps {
  readonly gaps: readonly WardrobeGap[];
  /** Apply a gap's pre-filtered query to the Shop and run the search. */
  readonly onFill: (gap: WardrobeGap) => void;
}

export function GapsHero({ gaps, onFill }: GapsHeroProps) {
  const { colors } = useTheme();

  // A covered closet is the brand's point: say so warmly, ask for nothing.
  if (gaps.length === 0) {
    return (
      <View style={styles.container}>
        <Text variant="body" color={colors.secondaryStrong}>
          {strings.shop.gaps.empty}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text
        accessibilityRole="header"
        variant="ui"
        size="title3"
        weight={700}
        color={colors.text}
      >
        {strings.shop.gaps.title}
      </Text>

      <Text variant="body" size="subhead" color={colors.secondaryStrong}>
        {strings.shop.gaps.intro}
      </Text>

      <View style={styles.cards}>
        {gaps.map((gap) => (
          <GapCard key={gap.category} gap={gap} onFill={onFill} />
        ))}
      </View>
    </View>
  );
}

/** One gap: the honest reason, an unlock badge, and the pre-filter CTA. */
function GapCard({ gap, onFill }: { gap: WardrobeGap; onFill: (gap: WardrobeGap) => void }) {
  const { colors } = useTheme();
  const fillLabel = `${strings.shop.gaps.fillCta} — ${strings.closet.categoryLabel(gap.category)}`;
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.hairline, borderRadius: radii.card },
      ]}
    >
      <Text variant="body" color={colors.text}>
        {strings.shop.gaps.reason(gap)}
      </Text>

      <Text variant="ui" size="footnote" weight={600} color={colors.secondary}>
        {strings.shop.gaps.unlocksLabel(gap.unlocksOutfits)}
      </Text>

      <Button
        label={strings.shop.gaps.fillCta}
        accessibilityLabel={fillLabel}
        variant="secondary"
        haptic
        onPress={() => onFill(gap)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.s3,
    paddingBottom: spacing.s6,
  },
  cards: {
    gap: spacing.s3,
  },
  card: {
    gap: spacing.s2,
    padding: spacing.s4,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
    alignItems: 'flex-start',
  },
});
