/**
 * ActionRail — the right-edge column on a feed card: like, save, shop-similar,
 * more. Each is a 44pt glass target over the cover image, so the buttons read
 * against any photo. Like/save carry a live count and flip filled↔outline glyph
 * to show the viewer's own state; the fill (not a colour change) is the signal, so
 * the rail stays monochrome-light for contrast. Every tap fires a selection
 * haptic before its callback.
 *
 * Glyphs are system-font characters, not an icon set — the app has none yet
 * ("labels-only until an icon set lands", per TabBar). Each button's meaning is
 * carried by its `strings.feed.rail` accessibility label; the glyph is the
 * placeholder an icon set will replace.
 */
import { strings } from '@era/core/strings';
import { spacing, typeRamp, palette, glass, radii } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { FeedPostPayload } from '@era/core/feed';

const ON_IMAGE = palette.white;
const TARGET = 44;

/** Compact count: 999 → "999", 1_200 → "1.2k", 12_300 → "12k". */
function compact(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return k < 10 ? `${k.toFixed(1).replace(/\.0$/, '')}k` : `${Math.round(k)}k`;
}

interface RailButtonProps {
  readonly glyph: string;
  readonly label: string;
  readonly caption?: string;
  readonly onPress: () => void;
}

function RailButton({ glyph, label, caption, onPress }: RailButtonProps) {
  return (
    <View style={styles.item}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => {
          void Haptics.selectionAsync();
          onPress();
        }}
        style={styles.button}
      >
        <BlurView intensity={glass.blur} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.buttonTint} />
        <Text style={styles.glyph}>{glyph}</Text>
      </Pressable>
      {caption ? (
        <Text style={styles.caption} accessible={false}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

interface ActionRailProps {
  readonly post: FeedPostPayload;
  readonly onLike: () => void;
  readonly onSave: () => void;
  readonly onShopSimilar: () => void;
  readonly onMore: () => void;
}

export function ActionRail({ post, onLike, onSave, onShopSimilar, onMore }: ActionRailProps) {
  return (
    <View style={styles.rail}>
      <RailButton
        glyph={post.viewer.liked ? '♥' : '♡'}
        label={strings.feed.rail.like}
        caption={compact(post.likeCount)}
        onPress={onLike}
      />
      <RailButton
        glyph={post.viewer.saved ? '★' : '☆'}
        label={strings.feed.rail.save}
        caption={compact(post.saveCount)}
        onPress={onSave}
      />
      <RailButton glyph="⊕" label={strings.feed.rail.shopSimilar} onPress={onShopSimilar} />
      <RailButton glyph="⋯" label={strings.feed.rail.more} onPress={onMore} />
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    alignItems: 'center',
    gap: spacing.s4,
  },
  item: {
    alignItems: 'center',
    gap: spacing.s1,
  },
  button: {
    width: TARGET,
    height: TARGET,
    borderRadius: radii.card,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  buttonTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(28, 27, 25, 0.28)',
  },
  glyph: {
    color: ON_IMAGE,
    fontSize: typeRamp.title3.pt,
    lineHeight: typeRamp.title3.lineHeight,
  },
  caption: {
    color: ON_IMAGE,
    fontSize: typeRamp.caption.pt,
    lineHeight: typeRamp.caption.lineHeight,
    fontWeight: '600',
  },
});
