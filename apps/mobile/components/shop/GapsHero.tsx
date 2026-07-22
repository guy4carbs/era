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
import { spacing } from '@era/tokens';
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
      {/* Editorial section marker (D8): the title in Fraunces-Italic (oviAccent)
          followed by a hairline rule filling the row — a magazine header, not a
          banner box. */}
      <View style={styles.labelRow} accessibilityRole="header">
        <Text variant="oviAccent" color={colors.text}>
          {strings.shop.gaps.title}
        </Text>
        <View style={[styles.rule, { backgroundColor: colors.hairline }]} />
      </View>

      <Text variant="body" size="subhead" color={colors.secondaryStrong}>
        {strings.shop.gaps.intro}
      </Text>

      <View style={styles.rows}>
        {gaps.map((gap) => (
          <GapRow key={gap.category} gap={gap} onFill={onFill} />
        ))}
      </View>
    </View>
  );
}

/**
 * One gap as an editorial row (no card box): the honest reason and its unlock
 * count in normal flow over a hairline divider, with a quiet ghost CTA. The
 * restraint is the point — guidance, not a merchandising tile.
 */
function GapRow({ gap, onFill }: { gap: WardrobeGap; onFill: (gap: WardrobeGap) => void }) {
  const { colors } = useTheme();
  const fillLabel = `${strings.shop.gaps.fillCta} — ${strings.closet.categoryLabel(gap.category)}`;
  return (
    <View style={[styles.row, { borderTopColor: colors.hairline }]}>
      <View style={styles.rowBody}>
        <Text variant="body" color={colors.text}>
          {strings.shop.gaps.reason(gap)}
        </Text>
        <Text variant="ui" size="footnote" weight={600} color={colors.secondary}>
          {strings.shop.gaps.unlocksLabel(gap.unlocksOutfits)}
        </Text>
      </View>

      <Button
        label={strings.shop.gaps.fillCta}
        accessibilityLabel={fillLabel}
        variant="ghost"
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
  // The Fraunces-Italic label + the hairline rule that fills the rest of the row.
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  rule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  rows: {
    gap: spacing.s3,
  },
  // Each gap sits over a hairline divider, its reason/unlock stacked with the
  // quiet CTA trailing — an editorial line, not a bordered card.
  row: {
    gap: spacing.s2,
    paddingTop: spacing.s3,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-start',
  },
  rowBody: {
    gap: spacing.s1,
  },
});
