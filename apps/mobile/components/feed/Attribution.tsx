/**
 * Attribution — the bottom-left creator credit on a feed card.
 *
 * A 32px avatar (expo-image, with an initialled fallback when a creator has none),
 * the `@username`, and the look's title, laid over the card's dark scrim so its
 * text is light regardless of theme. Tapping it opens the creator's web profile
 * (`{API_URL}/{username}`) — there is no native profile screen yet, so this is the
 * deliberate handoff to the web page (a native creator screen is a fast-follow).
 */
import { glass, spacing, palette } from '@era/tokens';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { StyleSheet, View } from 'react-native';

import { Press } from '@/components/Press';
import { Text } from '@/components/Text';

import type { FeedPostCreator } from '@era/core/feed';

// On-image chrome uses fixed light colours — theme text would vanish on the scrim.
const ON_IMAGE = palette.white;
const AVATAR = 32;
// The dim title and the avatar-fallback fill ride the white token at glass
// opacities (no rgba literals): the title at the busy-tint strength (a legible
// but recessive dim), the fallback disc at the light glass tint.
const TITLE_DIM_OPACITY = glass.busyTintOpacity.light;
const AVATAR_FALLBACK_OPACITY = glass.tintOpacity.light;

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

interface AttributionProps {
  readonly creator: FeedPostCreator;
  readonly title: string | null;
}

export function Attribution({ creator, title }: AttributionProps) {
  const open = () => {
    void Linking.openURL(`${baseURL}/${creator.username}`);
  };

  return (
    <Press
      accessibilityRole="link"
      accessibilityLabel={`@${creator.username}${title ? `, ${title}` : ''}`}
      onPress={open}
      style={styles.row}
    >
      {creator.avatarUrl ? (
        <Image
          source={{ uri: creator.avatarUrl }}
          style={styles.avatar}
          contentFit="cover"
          transition={150}
          accessible={false}
        />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          {/* Translucent white fill as its own layer, so its opacity never dims
              the initial above it. */}
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: ON_IMAGE, opacity: AVATAR_FALLBACK_OPACITY }]}
            pointerEvents="none"
          />
          <Text variant="ui" size="footnote" weight={600} color={ON_IMAGE}>
            {creator.username.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.text}>
        {/* The creator credit in Ovi's editorial serif accent (Fraunces Italic) —
            the sanctioned small-serif exception, on-image light. */}
        <Text variant="oviAccent" size="subhead" color={ON_IMAGE} numberOfLines={1}>
          @{creator.username}
        </Text>
        {title ? (
          <Text variant="caption" size="footnote" color={ON_IMAGE} style={{ opacity: TITLE_DIM_OPACITY }} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    // Leave room for the right action rail; the card positions this bottom-left.
    flexShrink: 1,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  text: {
    flexShrink: 1,
    gap: spacing.s1 / 2,
  },
});
