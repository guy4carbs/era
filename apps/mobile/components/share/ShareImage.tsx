/**
 * ShareImage — an expo-image tile that reports back when it settles.
 *
 * Thin wrapper used only inside share templates: it calls `onSettled` from both
 * `onLoad` and `onError` so a broken URL still advances the readiness gate rather
 * than hanging capture. `contentFit` is the caller's call — `cover` for
 * photographic covers, `contain` for transparent garment cutouts on the cream.
 */
import { Image } from 'expo-image';
import type { StyleProp, ImageStyle } from 'react-native';

interface ShareImageProps {
  readonly uri: string;
  readonly contentFit: 'cover' | 'contain';
  readonly style: StyleProp<ImageStyle>;
  readonly onSettled: () => void;
}

export function ShareImage({ uri, contentFit, style, onSettled }: ShareImageProps) {
  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit={contentFit}
      onLoad={onSettled}
      onError={onSettled}
      accessible={false}
    />
  );
}
