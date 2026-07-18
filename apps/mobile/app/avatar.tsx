/**
 * Avatar onboarding — the modal that builds a user's try-on avatar from their own
 * photos. Presented over the app as a modal (registered in the root Stack).
 *
 * Flow:  consent → pick photos → upload + create (progress) → success preview → done
 *                                       ↘ failed (calm retry, photos kept)
 *
 * Consent is mandatory and comes first (`ConsentScreen`); nothing is uploaded until
 * the user agrees. The photo step downscales + strips EXIF on device
 * (`AvatarPhotoStep`), then this screen uploads each via a presigned PUT and calls
 * the slow create (FASHN Model Creation, ~30–90s) with a poll fallback. A
 * `plus_required` anywhere routes to the paywall (honest upsell); the dormant
 * (flag-off) beat is a calm "coming soon", never an error. Reachable only when the
 * cosmetic try-on flag is on and only for a signed-in user.
 */
import { strings } from '@era/core/strings';
import { spacing } from '@era/tokens';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvatarPhotoStep, ConsentScreen } from '@/components/avatar';
import {
  PlusRequiredError,
  TryonUnavailableError,
  createAvatar,
  requestAvatarUploadUrl,
  uploadAvatarPhoto,
} from '@/components/avatar/api';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { useSession } from '@/lib/auth-client';
import { eraTryonEnabled } from '@/lib/tryon-flag';
import { useTheme } from '@/lib/theme';
import type { AvatarPhoto } from '@/lib/avatar-photo';

type Stage = 'consent' | 'photo' | 'creating' | 'unavailable' | 'failed' | 'done';

// Route files require a default export — expo-router discovers screens this way.
export default function AvatarRoute() {
  const { colors } = useTheme();
  const router = useRouter();
  const { data, isPending } = useSession();

  const [stage, setStage] = useState<Stage>('consent');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Kept so a failed create can retry without forcing a re-pick.
  const [photos, setPhotos] = useState<readonly AvatarPhoto[]>([]);

  const runCreate = useCallback(
    async (picked: readonly AvatarPhoto[]) => {
      setPhotos(picked);
      setStage('creating');
      try {
        const keys: string[] = [];
        for (const photo of picked) {
          const target = await requestAvatarUploadUrl('jpg', 'image/jpeg');
          keys.push(await uploadAvatarPhoto(target, photo.uri, 'image/jpeg'));
        }
        const state = await createAvatar(keys);
        if (state.status === 'ready') {
          setPreviewUrl(state.previewUrl ?? null);
          setStage('done');
        } else {
          // `failed` (or an unexpected non-ready) — calm retry, photos kept.
          setStage('failed');
        }
      } catch (error) {
        if (error instanceof PlusRequiredError) {
          router.replace('/paywall');
          return;
        }
        if (error instanceof TryonUnavailableError) {
          setStage('unavailable');
          return;
        }
        setStage('failed');
      }
    },
    [router],
  );

  if (isPending) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.bg }]}>
        <Stack.Screen options={{ presentation: 'modal' }} />
        <ActivityIndicator color={colors.text} />
      </SafeAreaView>
    );
  }

  // Every step here is account-scoped; an unauthenticated visitor goes to sign-in.
  if (!data) {
    return <Redirect href="/sign-in" />;
  }

  // Flag off (or a stale deep link) → the feature does not exist; bounce home.
  if (!eraTryonEnabled) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ presentation: 'modal' }} />

      {stage === 'consent' ? (
        <ConsentScreen onAgree={() => setStage('photo')} onCancel={() => router.back()} />
      ) : stage === 'photo' ? (
        <AvatarPhotoStep onContinue={(picked) => void runCreate(picked)} />
      ) : stage === 'creating' ? (
        <Progress line={strings.tryon.creating} />
      ) : stage === 'unavailable' ? (
        <Message line={strings.tryon.unavailable} onClose={() => router.back()} />
      ) : stage === 'failed' ? (
        <Failed onRetry={() => void runCreate(photos)} onClose={() => router.back()} />
      ) : (
        <Done previewUrl={previewUrl} onDone={() => router.back()} />
      )}
    </SafeAreaView>
  );
}

/** A centered spinner with the patient creation line. */
function Progress({ line }: { readonly line: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.centeredBlock}>
      <ActivityIndicator color={colors.text} />
      <Text variant="body" color={colors.secondaryStrong} style={{ textAlign: 'center' }}>
        {line}
      </Text>
    </View>
  );
}

/** The success beat — a preview of the finished avatar, then a plain done. */
function Done({ previewUrl, onDone }: { readonly previewUrl: string | null; readonly onDone: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.doneScreen}>
      <View style={styles.previewWrap}>
        {previewUrl ? (
          <Image
            source={{ uri: previewUrl }}
            style={styles.preview}
            resizeMode="contain"
            accessibilityLabel={strings.tryon.consent.heading}
          />
        ) : (
          <Text
            accessibilityRole="header"
            variant="title"
            size="title3"
            color={colors.text}
            style={{ textAlign: 'center' }}
          >
            {strings.tryon.consent.heading}
          </Text>
        )}
      </View>
      <View style={styles.actions}>
        <Button label={strings.common.continue} variant="primary" haptic onPress={onDone} />
      </View>
    </View>
  );
}

/** The calm failure beat — retry (photos kept) or step out. */
function Failed({ onRetry, onClose }: { readonly onRetry: () => void; readonly onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.doneScreen}>
      <View style={styles.centeredBlock}>
        <Text variant="body" color={colors.text} style={{ textAlign: 'center' }}>
          {strings.tryon.failed}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button label={strings.errors.retry} variant="primary" onPress={onRetry} />
        <Button label={strings.common.notNow} variant="ghost" onPress={onClose} />
      </View>
    </View>
  );
}

/** A calm single-line message with a dismiss (the dormant "coming soon" beat). */
function Message({ line, onClose }: { readonly line: string; readonly onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.doneScreen}>
      <View style={styles.centeredBlock}>
        <Text variant="body" color={colors.secondaryStrong} style={{ textAlign: 'center' }}>
          {line}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button label={strings.common.notNow} variant="ghost" onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centeredBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s4,
    padding: spacing.s6,
  },
  doneScreen: {
    flex: 1,
    justifyContent: 'space-between',
  },
  previewWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.s6,
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  actions: {
    paddingHorizontal: spacing.s6,
    paddingBottom: spacing.s6,
    gap: spacing.s3,
  },
});
