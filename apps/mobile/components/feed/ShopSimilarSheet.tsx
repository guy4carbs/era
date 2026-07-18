/**
 * ShopSimilarSheet — "From your closet — wear it with".
 *
 * Opens on the shop-similar rail tap: fetches the posted look mapped onto the
 * VIEWER's own items ({@link fetchShopSimilar}) and shows those cutouts as tiles.
 * When the closet has nothing that matches, it states so plainly and offers the
 * one honest way forward — Shop, for a real gap (the trust rule carried into the
 * feed). It never pushes buying over owning.
 *
 * The request is torn down on close via an AbortController, and a stale response
 * (one that resolves after the sheet moved to a different post or closed) is
 * dropped by the effect's own re-run — the fetch is keyed on `postId`.
 */
import { strings } from '@era/core/strings';
import { radii, spacing } from '@era/tokens';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { GlassSheet } from '@/components/GlassSheet';
import { useTheme } from '@/lib/theme';

import { fetchShopSimilar, type ShopSimilarMatch } from './api';

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly matches: readonly ShopSimilarMatch[] }
  | { readonly kind: 'error' };

interface ShopSimilarSheetProps {
  readonly postId: string | null;
  readonly onClose: () => void;
}

export function ShopSimilarSheet({ postId, onClose }: ShopSimilarSheetProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  // Bumped by the retry button so the fetch effect re-runs for the same post.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (postId === null) {
      setLoad({ kind: 'loading' });
      return;
    }
    const controller = new AbortController();
    setLoad({ kind: 'loading' });
    void (async () => {
      try {
        const result = await fetchShopSimilar(postId, controller.signal);
        // Flatten every slot's matches into one "wear it with" set, in slot order.
        const matches = result.slots.flatMap((slot) => slot.matches);
        setLoad({ kind: 'ready', matches });
      } catch {
        if (controller.signal.aborted) return; // sheet closed / moved on — ignore
        setLoad({ kind: 'error' });
      }
    })();
    return () => controller.abort();
  }, [postId, reloadKey]);

  const goToShop = () => {
    onClose();
    router.push('/(tabs)/shop');
  };

  // A failed fetch must NEVER read as "your closet has nothing" — that claim
  // steers toward Shop on information we don't have (the trust rule). Errors
  // get their own honest branch with a retry; the empty state is reserved for
  // a genuinely empty result.
  const empty = load.kind === 'ready' && load.matches.length === 0;

  return (
    <GlassSheet open={postId !== null} onClose={onClose}>
      <Text variant="ui" size="title3" weight={600} color={colors.text} accessibilityRole="header">
        {strings.feed.shopSimilarTitle}
      </Text>

      {load.kind === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : load.kind === 'error' ? (
        <View style={styles.empty}>
          <Text variant="body" color={colors.secondaryStrong} style={{ textAlign: 'center' }}>
            {strings.errors.generic}
          </Text>
          <Button
            label={strings.errors.retry}
            variant="secondary"
            onPress={() => setReloadKey((key) => key + 1)}
          />
        </View>
      ) : empty ? (
        <View style={styles.empty}>
          <Text variant="body" color={colors.secondaryStrong} style={{ textAlign: 'center' }}>
            {strings.feed.shopSimilarEmpty}
          </Text>
          <Button label={strings.feed.shopSimilarGapCta} variant="secondary" onPress={goToShop} />
        </View>
      ) : (
        <ScrollView
          style={styles.grid}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
        >
          {load.matches.map((match) => (
            <View key={match.itemId} style={styles.tile}>
              <View
                style={[
                  styles.thumb,
                  { backgroundColor: colors.surface, borderColor: colors.hairline },
                ]}
              >
                {match.displayUrl ? (
                  <Image
                    source={{ uri: match.displayUrl }}
                    style={StyleSheet.absoluteFill}
                    contentFit="contain"
                    transition={150}
                    accessible={false}
                  />
                ) : null}
              </View>
              <Text variant="caption" size="footnote" color={colors.text} numberOfLines={1}>
                {match.name}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  centered: {
    paddingVertical: spacing.s12,
    alignItems: 'center',
  },
  empty: {
    paddingVertical: spacing.s8,
    gap: spacing.s4,
    alignItems: 'center',
  },
  grid: {
    marginTop: spacing.s3,
  },
  gridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s3,
    paddingBottom: spacing.s4,
  },
  tile: {
    // Three-up grid: (100% - 2 gaps) / 3, expressed against the sheet padding.
    width: '31%',
    gap: spacing.s1,
  },
  thumb: {
    width: '100%',
    aspectRatio: 0.8,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
});
