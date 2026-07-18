/**
 * AvatarPhotoStep — pick 1–3 source photos, on-device downscale + EXIF/GPS strip,
 * then hand the picked list up for upload + creation.
 *
 * Reuses the AddItemFlow photo idiom exactly (`expo-image-picker` →
 * `ImageManipulator.manipulateAsync` re-encode, no new deps): the re-encode is what
 * strips EXIF/GPS, and {@link avatarResizeActions} caps the long edge at 1600px.
 * The pure list + resize logic lives in `lib/avatar-photo.ts` (node-tested); this
 * component is just the picker, the thumbnail grid with per-photo remove, and the
 * gated "create" hand-off. Nothing leaves the device here — the parent
 * (`app/avatar.tsx`) does the upload + create once the user continues.
 */
import { spacing, radii } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { useTheme } from '@/lib/theme';
import {
  addAvatarPhoto,
  avatarResizeActions,
  canAddAvatarPhoto,
  canCreateAvatar,
  removeAvatarPhotoAt,
  type AvatarPhoto,
} from '@/lib/avatar-photo';

import { avatarCopy } from './copy';

interface AvatarPhotoStepProps {
  /** Hand the downscaled + re-encoded photos (1–3) up for upload + creation. */
  readonly onContinue: (photos: readonly AvatarPhoto[]) => void;
}

export function AvatarPhotoStep({ onContinue }: AvatarPhotoStepProps) {
  const { colors } = useTheme();
  const [photos, setPhotos] = useState<readonly AvatarPhoto[]>([]);

  const pick = useCallback(async () => {
    if (!canAddAvatarPhoto(photos)) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      // Downscale to a 1600px long edge (if larger) and re-encode JPEG — the
      // re-encode strips EXIF/GPS. Same idiom AddItemFlow uses for closet uploads.
      const actions = avatarResizeActions(asset.width ?? 0, asset.height ?? 0);
      const image = await ImageManipulator.manipulateAsync(asset.uri, actions, {
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      setPhotos((prev) => addAvatarPhoto(prev, image.uri));
    } catch {
      // A failed pick/manipulate leaves the current selection untouched; the user
      // can simply tap add again. No cold error for a cancelled/interrupted pick.
    }
  }, [photos]);

  const remove = useCallback((index: number) => {
    void Haptics.selectionAsync();
    setPhotos((prev) => removeAvatarPhotoAt(prev, index));
  }, []);

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <Text accessibilityRole="header" variant="ui" size="title2" weight={700}>
          {avatarCopy.photoHeading}
        </Text>
        <Text variant="body" color={colors.secondaryStrong}>
          {avatarCopy.photoHelp}
        </Text>

        <View style={styles.grid}>
          {photos.map((photo, index) => (
            <View key={photo.uri} style={[styles.thumb, { borderColor: colors.hairline }]}>
              <Image source={{ uri: photo.uri }} style={styles.thumbImage} resizeMode="cover" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={avatarCopy.removePhoto}
                onPress={() => remove(index)}
                style={[styles.removeBadge, { backgroundColor: colors.ink }]}
              >
                <Text variant="ui" size="footnote" weight={700} color={colors.bg}>
                  {'×'}
                </Text>
              </Pressable>
            </View>
          ))}
          {canAddAvatarPhoto(photos) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={avatarCopy.addPhoto}
              onPress={() => {
                void Haptics.selectionAsync();
                void pick();
              }}
              style={[styles.thumb, styles.addTile, { borderColor: colors.hairline, backgroundColor: colors.surface }]}
            >
              <Text variant="ui" size="title1" weight={300} color={colors.secondary}>
                {'+'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          label={avatarCopy.continueToCreate}
          variant="primary"
          haptic
          disabled={!canCreateAvatar(photos)}
          onPress={() => onContinue(photos)}
        />
      </View>
    </View>
  );
}

// A fixed 3-up grid: the thumbnail box is sized off spacing tokens so the row
// holds all MAX_AVATAR_PHOTOS plus the add tile without wrapping awkwardly.
const THUMB = spacing.s16 + spacing.s8;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'space-between',
  },
  content: {
    padding: spacing.s6,
    gap: spacing.s4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s3,
    paddingTop: spacing.s2,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radii.input,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  addTile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBadge: {
    position: 'absolute',
    top: spacing.s1,
    right: spacing.s1,
    width: spacing.s6,
    height: spacing.s6,
    borderRadius: radii.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    paddingHorizontal: spacing.s6,
    paddingBottom: spacing.s6,
  },
});
