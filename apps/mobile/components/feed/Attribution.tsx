/**
 * Attribution — the bottom-left creator credit on a feed card.
 *
 * A 32px avatar (expo-image, with an initialled fallback when a creator has none),
 * the `@username`, and the look's title, laid over the card's dark scrim so its
 * text is light regardless of theme. Tapping it opens the creator's web profile
 * (`{API_URL}/{username}`) — there is no native profile screen yet, so this is the
 * deliberate handoff to the web page (a native creator screen is a fast-follow).
 */
import { spacing, typeRamp, palette } from '@era/tokens';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { FeedPostCreator } from '@era/core/feed';

// On-image chrome uses fixed light colours — theme text would vanish on the scrim.
const ON_IMAGE = palette.white;
const ON_IMAGE_DIM = 'rgba(255, 255, 255, 0.82)';
const AVATAR = 32;

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
    <Pressable
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
          <Text style={styles.avatarInitial}>{creator.username.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.text}>
        <Text numberOfLines={1} style={styles.username}>
          @{creator.username}
        </Text>
        {title ? (
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
        ) : null}
      </View>
    </Pressable>
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
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  avatarInitial: {
    color: ON_IMAGE,
    fontSize: typeRamp.footnote.pt,
    fontWeight: '600',
  },
  text: {
    flexShrink: 1,
    gap: spacing.s1 / 2,
  },
  username: {
    color: ON_IMAGE,
    fontSize: typeRamp.subhead.pt,
    lineHeight: typeRamp.subhead.lineHeight,
    fontWeight: '600',
  },
  title: {
    color: ON_IMAGE_DIM,
    fontSize: typeRamp.footnote.pt,
    lineHeight: typeRamp.footnote.lineHeight,
  },
});
