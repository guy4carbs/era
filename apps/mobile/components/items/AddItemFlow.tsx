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
 *
 * The picker also offers "add from a link": paste a product URL (validated as
 * https on the client) and the server reads the page and runs the same pipeline,
 * landing on the same confirm step. A link that yields nothing shows the honest
 * `linkFailed` line and drops back to the picker, so the photo path stays open.
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
import { Input } from '@/components/Input';
import { trackOnce } from '@/lib/analytics';
import { LimitReachedError } from '@/lib/rate-limit';
import { useTheme } from '@/lib/theme';

import { BulkCaptureFlow } from './BulkCaptureFlow';
import { ConfirmItem } from './ConfirmItem';
import { importFromUrl, processItem, requestUpload, uploadToR2 } from './api';

/** Longest-edge cap for uploads (px). Matches the web downscale + CLAUDE.md. */
const MAX_EDGE = 1600;
/** How long the saved line lingers before returning to the closet. */
const SAVED_DWELL_MS = 900;
/** The limit line is longer and worth reading — hold it a beat more than a save. */
const LIMIT_DWELL_MS = 3200;

type Stage =
  | 'picker'
  | 'uploading'
  | 'processing'
  | 'importing'
  | 'confirm'
  | 'saved'
  | 'failed'
  | 'linkFailed'
  // The AI daily cap was hit while processing — Ovi's warm line, not a failure.
  | 'limitReached'
  // The batch path: one photo of several pieces, split into per-item drafts.
  | 'bulk';

interface AddItemFlowProps {
  /** When present, skip the picker and resume confirming this item. */
  readonly resumeItemId?: string;
}

export function AddItemFlow({ resumeItemId }: AddItemFlowProps) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(resumeItemId ? 'confirm' : 'picker');
  const [itemId, setItemId] = useState<string | null>(resumeItemId ?? null);
  const [vision, setVision] = useState<boolean | undefined>(undefined);
  // The warm line to show when the daily processing cap is hit (server-provided,
  // falling back to Ovi's canonical processing-limit line).
  const [limitLine, setLimitLine] = useState<string>(strings.ovi.limitReachedProcessing);
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
    } catch (error) {
      if (error instanceof LimitReachedError) {
        setLimitLine(error.serverMessage ?? strings.ovi.limitReachedProcessing);
        setStage('limitReached');
        return;
      }
      setStage('failed');
    }
  }, []);

  // Import from a product link: the server reads the page and runs the same
  // pipeline, so a success lands on the very same confirm step a photo does. A
  // failure drops back to the picker, keeping the photo path one tap away.
  const runImport = useCallback(async (url: string) => {
    setStage('importing');
    try {
      const { item, processed } = await importFromUrl(url);
      setItemId(item.id);
      setVision(processed.vision);
      setStage('confirm');
    } catch {
      setStage('linkFailed');
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

  // Limit reached: linger on Ovi's warm line long enough to read, then step back
  // to the closet. Nothing to retry — the cap resets tomorrow.
  useEffect(() => {
    if (stage !== 'limitReached') return;
    const timer = setTimeout(() => router.replace('/(tabs)/closet'), LIMIT_DWELL_MS);
    return () => clearTimeout(timer);
  }, [stage, router]);

  switch (stage) {
    case 'picker':
      return <Picker onPick={pick} onImport={runImport} onBulk={() => setStage('bulk')} />;
    // The batch sub-flow owns its own states + return; its exit drops back here so
    // the single-add paths (photo, link) stay one tap away.
    case 'bulk':
      return <BulkCaptureFlow onExit={() => setStage('picker')} />;
    case 'uploading':
      return <Progress line={strings.closet.uploading} />;
    case 'processing':
      return <Progress line={strings.closet.processing} />;
    case 'importing':
      return <Progress line={strings.closet.importLink} />;
    case 'confirm':
      return itemId ? (
        <ConfirmItem
          itemId={itemId}
          vision={vision}
          onSaved={() => {
            // Funnel: the user's first-ever confirmed piece (best-effort once).
            void trackOnce('first_item_added');
            setStage('saved');
          }}
        />
      ) : (
        <Failure onRetry={retry} />
      );
    case 'saved':
      return <Saved />;
    case 'failed':
      return <Failure onRetry={retry} />;
    // A link that read nothing: honest line, and a retry back to the picker so
    // the photo path (and another paste) is right there.
    case 'linkFailed':
      return <Failure onRetry={() => setStage('picker')} line={strings.closet.linkFailed} />;
    // Daily processing cap: Ovi's warm line, then back to the closet — no retry,
    // there's nothing to fix and their work is already safe.
    case 'limitReached':
      return <LimitReached line={limitLine} />;
  }
}

interface PickerProps {
  readonly onPick: (source: 'camera' | 'library') => void;
  readonly onImport: (url: string) => void;
  readonly onBulk: () => void;
}

/**
 * The source chooser — take / choose a photo, plus an "add from a link" card
 * that reveals a URL field. The link is validated as https before it can submit,
 * so the submit button stays disabled until the paste is a usable link. A quiet
 * "add several at once" card at the foot opens the batch flow.
 */
function Picker({ onPick, onImport, onBulk }: PickerProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState('');
  const trimmed = url.trim();

  const submit = () => {
    if (!isImportableUrl(trimmed)) return;
    void Haptics.selectionAsync();
    onImport(trimmed);
  };

  return (
    <View style={styles.picker}>
      <SourceCard label={strings.closet.takePhoto} onPress={() => onPick('camera')} />
      <SourceCard label={strings.closet.pickPhoto} onPress={() => onPick('library')} />
      {linkOpen ? (
        <View style={styles.linkPanel}>
          <Input
            value={url}
            onChangeText={setUrl}
            placeholder={strings.closet.pasteLink}
            accessibilityLabel={strings.closet.pasteLink}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            inputMode="url"
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={submit}
            containerStyle={styles.linkInput}
          />
          <Button
            label={strings.closet.addFromLink}
            onPress={submit}
            disabled={!isImportableUrl(trimmed)}
          />
        </View>
      ) : (
        <SourceCard label={strings.closet.addFromLink} onPress={() => setLinkOpen(true)} />
      )}
      <SourceCard label={strings.closet.bulkCapture.entryCta} onPress={onBulk} />
    </View>
  );
}

/** True when `value` parses as an https URL with a host — the import gate. */
function isImportableUrl(value: string): boolean {
  if (!/^https:\/\//i.test(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname.length > 0;
  } catch {
    return false;
  }
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

/**
 * The daily-cap beat: Ovi's warm line, centered, with no retry. The flow returns
 * to the closet on its own after a dwell — the work so far is already saved.
 */
function LimitReached({ line }: { readonly line: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.centered}>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.text,
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

/**
 * The honest failure line with a retry. Defaults to the upload/process `addFailed`
 * line; a caller can pass a more specific line (e.g. the link miss).
 */
function Failure({ onRetry, line }: { readonly onRetry: () => void; readonly line?: string }) {
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
        {line ?? strings.closet.addFailed}
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
  // The revealed link entry sits to content height, so the two photo cards keep
  // the room while the URL field + submit tuck in below.
  linkPanel: {
    gap: spacing.s3,
  },
  linkInput: {
    alignSelf: 'stretch',
  },
});
