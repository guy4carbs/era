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
import { radii, spacing, typeRamp } from '@era/tokens';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

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
  }, [postId]);

  const goToShop = () => {
    onClose();
    router.push('/(tabs)/shop');
  };

  const empty =
    (load.kind === 'ready' && load.matches.length === 0) || load.kind === 'error';

  return (
    <GlassSheet open={postId !== null} onClose={onClose}>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.text,
          fontSize: typeRamp.title3.pt,
          lineHeight: typeRamp.title3.lineHeight,
          fontWeight: '600',
        }}
      >
        {strings.feed.shopSimilarTitle}
      </Text>

      {load.kind === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : empty ? (
        <View style={styles.empty}>
          <Text
            style={{
              color: colors.secondaryStrong,
              fontSize: typeRamp.body.pt,
              lineHeight: typeRamp.body.lineHeight,
              textAlign: 'center',
            }}
          >
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
              <Text
                numberOfLines={1}
                style={{
                  color: colors.text,
                  fontSize: typeRamp.footnote.pt,
                  lineHeight: typeRamp.footnote.lineHeight,
                }}
              >
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
