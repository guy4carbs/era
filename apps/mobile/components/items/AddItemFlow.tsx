/**
 * AddItemFlow — the add-a-piece stage machine.
 *
 *   picker → uploading → processing → confirm → saved      (happy path)
 *                     ↘ failed → (retry resumes the step)
 *
 * Picker offers take-photo / choose-photo. The camera needs an explicit
 * permission grant; the library picker prompts on launch. The chosen image is
 * downscaled to a 1600px long edge (only if larger) and re-encoded JPEG, PUT
 * direct to R2 via a presigned URL, then handed to processing. Processing's
 * `vision` flag decides the confirm heading. Confirm hands back a save, which
 * shows the saved line, fires no extra motion under reduced-motion, and returns
 * to the closet.
 *
 * A resume (`resumeItemId`) jumps straight to confirm for an unconfirmed item.
 * Failures surface the honest `addFailed` line; retry re-runs the same step
 * with the image already in hand — never forcing a re-pick.
 */
import { strings } from '@era/core/strings';
import { radii, rnShadow, spacing, typeRamp } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { useTheme } from '@/lib/theme';

import { ConfirmItem } from './ConfirmItem';
import { processItem, requestUpload, uploadToR2 } from './api';

/** Longest-edge cap for uploads (px). Matches the web downscale + CLAUDE.md. */
const MAX_EDGE = 1600;
/** How long the saved line lingers before returning to the closet. */
const SAVED_DWELL_MS = 900;

type Stage = 'picker' | 'uploading' | 'processing' | 'confirm' | 'saved' | 'failed';

interface AddItemFlowProps {
  /** When present, skip the picker and resume confirming this item. */
  readonly resumeItemId?: string;
}

export function AddItemFlow({ resumeItemId }: AddItemFlowProps) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(resumeItemId ? 'confirm' : 'picker');
  const [itemId, setItemId] = useState<string | null>(resumeItemId ?? null);
  const [vision, setVision] = useState<boolean | undefined>(undefined);
  // The last picked asset, kept so a failed upload can be retried without a
  // re-pick.
  const lastAsset = useRef<ImagePicker.ImagePickerAsset | null>(null);

  const runUpload = useCallback(async (asset: ImagePicker.ImagePickerAsset) => {
    lastAsset.current = asset;
    setStage('uploading');
    try {
      const actions =
        asset.width && asset.width > MAX_EDGE ? [{ resize: { width: MAX_EDGE } }] : [];
      const image = await ImageManipulator.manipulateAsync(asset.uri, actions, {
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      const target = await requestUpload('jpg', 'image/jpeg');
      await uploadToR2(target.url, image.uri, 'image/jpeg');

      setStage('processing');
      const { item, processed } = await processItem(target.key);
      setItemId(item.id);
      setVision(processed.vision);
      setStage('confirm');
    } catch {
      setStage('failed');
    }
  }, []);

  const pick = useCallback(
    async (source: 'camera' | 'library') => {
      try {
        if (source === 'camera') {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            setStage('failed');
            return;
          }
        }
        const result =
          source === 'camera'
            ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                quality: 0.9,
              });
        if (result.canceled) return; // Backed out — stay on the picker, no error.
        const asset = result.assets[0];
        if (!asset) return; // Confirmed non-cancel with no asset — nothing to upload.
        await runUpload(asset);
      } catch {
        setStage('failed');
      }
    },
    [runUpload],
  );

  const retry = useCallback(() => {
    if (lastAsset.current) {
      void runUpload(lastAsset.current);
    } else {
      setStage('picker');
    }
  }, [runUpload]);

  // Saved: show the line, then hand back to the closet (which refreshes on focus).
  useEffect(() => {
    if (stage !== 'saved') return;
    const timer = setTimeout(() => router.replace('/(tabs)/closet'), SAVED_DWELL_MS);
    return () => clearTimeout(timer);
  }, [stage, router]);

  switch (stage) {
    case 'picker':
      return <Picker onPick={pick} />;
    case 'uploading':
      return <Progress line={strings.closet.uploading} />;
    case 'processing':
      return <Progress line={strings.closet.processing} />;
    case 'confirm':
      return itemId ? (
        <ConfirmItem itemId={itemId} vision={vision} onSaved={() => setStage('saved')} />
      ) : (
        <Failure onRetry={retry} />
      );
    case 'saved':
      return <Saved />;
    case 'failed':
      return <Failure onRetry={retry} />;
  }
}

/** The source chooser — two tappable cards. */
function Picker({ onPick }: { readonly onPick: (source: 'camera' | 'library') => void }) {
  return (
    <View style={styles.picker}>
      <SourceCard label={strings.closet.takePhoto} onPress={() => onPick('camera')} />
      <SourceCard label={strings.closet.pickPhoto} onPress={() => onPick('library')} />
    </View>
  );
}

/** A single large source card with a selection tick on tap. */
function SourceCard({ label, onPress }: { readonly label: string; readonly onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={[
        styles.sourceCard,
        rnShadow('e2'),
        { backgroundColor: colors.surface, borderColor: colors.hairline },
      ]}
    >
      <Text
        style={{
          color: colors.text,
          fontSize: typeRamp.title3.pt,
          lineHeight: typeRamp.title3.lineHeight,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A centered spinner with an Ovi progress line (uploading / processing). */
function Progress({ line }: { readonly line: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.text} />
      <Text
        style={{
          color: colors.secondaryStrong,
          fontSize: typeRamp.body.pt,
          lineHeight: typeRamp.body.lineHeight,
          textAlign: 'center',
        }}
      >
        {line}
      </Text>
    </View>
  );
}

/** The post-save line — the warm beat before returning to the closet. */
function Saved() {
  const { colors } = useTheme();
  return (
    <View style={styles.centered}>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.text,
          fontSize: typeRamp.title3.pt,
          lineHeight: typeRamp.title3.lineHeight,
          fontWeight: '600',
          textAlign: 'center',
        }}
      >
        {strings.closet.saved}
      </Text>
    </View>
  );
}

/** The honest failure line with a retry that resumes the failed step. */
function Failure({ onRetry }: { readonly onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.centered}>
      <Text
        style={{
          color: colors.text,
          fontSize: typeRamp.body.pt,
          lineHeight: typeRamp.body.lineHeight,
          textAlign: 'center',
        }}
      >
        {strings.closet.addFailed}
      </Text>
      <Button label={strings.closet.retryCta} variant="secondary" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  picker: {
    flex: 1,
    padding: spacing.s6,
    gap: spacing.s4,
  },
  sourceCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.hero,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s4,
    padding: spacing.s6,
  },
});
