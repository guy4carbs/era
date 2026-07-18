/**
 * BulkCaptureFlow — add several pieces from one flat-lay photo.
 *
 *   instruction → uploading → working → confirm → (done)     (happy path)
 *                          ↘ empty | dormant | failed | limitReached | aiPaused
 *
 * The counterpart to {@link AddItemFlow} for a group: photograph several garments
 * laid out together and let the server segment them into separate drafts. It
 * reuses the single-add pieces wholesale — the camera/library capture path, the
 * downscale + presigned-PUT upload helpers ({@link requestUpload}/{@link
 * uploadToR2}), and {@link ConfirmItem} for the per-item review — differing only
 * in the one call that fans out ({@link processBatch}) and the batch confirm that
 * steps through the returned drafts.
 *
 * States mirror the batch route's contract: an empty result splits on `reason`
 * into the honest "found nothing" nudge ({@link strings.closet.bulkCapture.found}
 * at 0) and the dormant-credential beat ({@link
 * strings.closet.bulkCapture.dormant}); a 429 shows the server's warm daily-cap
 * line; a 503 (global brake) reads as Ovi resting, not an outage. A partial
 * failure (`failed > 0`) surfaces on the confirm screen without blocking the
 * pieces that did land.
 */
import { strings } from '@era/core/strings';
import { radii, rnShadow, spacing } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { LimitReachedError } from '@/lib/rate-limit';
import { useTheme } from '@/lib/theme';

import { ConfirmItem } from './ConfirmItem';
import {
  AiPausedError,
  archiveItem,
  patchItem,
  processBatch,
  requestUpload,
  uploadToR2,
  type BatchItem,
} from './api';

/** Longest-edge cap for uploads (px). Matches the single-add flow + CLAUDE.md. */
const MAX_EDGE = 1600;

type Stage =
  | 'instruction'
  | 'uploading'
  | 'working'
  // Segmentation ran but pulled out nothing (reason `no_items_found`, or empty).
  | 'empty'
  // The segmentation credential is dormant (reason `segmentation_unavailable`).
  | 'dormant'
  | 'confirm'
  | 'failed'
  // The per-user daily processing cap was hit (429) — Ovi's warm line.
  | 'limitReached'
  // The global AI brake is engaged (503) — a gentle "back shortly", retryable.
  | 'aiPaused';

interface BulkCaptureFlowProps {
  /** Return to the single-add picker (offered on the dormant / empty beats). */
  readonly onExit: () => void;
}

export function BulkCaptureFlow({ onExit }: BulkCaptureFlowProps) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('instruction');
  const [items, setItems] = useState<readonly BatchItem[]>([]);
  const [failed, setFailed] = useState(0);
  // The warm line for a hit daily cap (server-provided, Ovi fallback otherwise).
  const [limitLine, setLimitLine] = useState<string>(strings.ovi.limitReachedProcessing);
  // The last picked flat-lay, kept so a failed upload retries without a re-pick.
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

      setStage('working');
      const result = await processBatch(target.key);
      if (result.items.length > 0) {
        setItems(result.items);
        setFailed(result.failed);
        setStage('confirm');
        return;
      }
      // Empty batch: the dormant credential reads as "waking up soon", anything
      // else as an honest "found nothing" with the fix (more space between pieces).
      setStage(result.reason === 'segmentation_unavailable' ? 'dormant' : 'empty');
    } catch (error) {
      if (error instanceof LimitReachedError) {
        setLimitLine(error.serverMessage ?? strings.ovi.limitReachedProcessing);
        setStage('limitReached');
        return;
      }
      if (error instanceof AiPausedError) {
        setStage('aiPaused');
        return;
      }
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
        if (result.canceled) return; // Backed out — stay on the instruction, no error.
        const asset = result.assets[0];
        if (!asset) return; // Non-cancel with no asset — nothing to upload.
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
      setStage('instruction');
    }
  }, [runUpload]);

  const done = useCallback(() => router.replace('/(tabs)/closet'), [router]);

  switch (stage) {
    case 'instruction':
      return <Instruction onPick={pick} />;
    case 'uploading':
      return <Progress line={strings.closet.uploading} />;
    case 'working':
      return <Progress line={strings.closet.bulkCapture.working} />;
    case 'confirm':
      return <BatchConfirm items={items} failed={failed} onDone={done} />;
    // Nothing segmented: the honest `found(0)` nudge; retry re-runs on a fresh
    // photo (the flow's Cancel header exits if they'd rather not).
    case 'empty':
      return (
        <Notice line={strings.closet.bulkCapture.found(0)}>
          <Button label={strings.closet.retryCta} variant="secondary" onPress={retry} />
        </Notice>
      );
    // Dormant credential: the warm "switching on" beat, with the single-add path out.
    case 'dormant':
      return (
        <Notice line={strings.closet.bulkCapture.dormant}>
          <Button label={strings.common.continue} variant="secondary" onPress={onExit} />
        </Notice>
      );
    case 'failed':
      return (
        <Notice line={strings.closet.addFailed}>
          <Button label={strings.closet.retryCta} variant="secondary" onPress={retry} />
        </Notice>
      );
    // Daily processing cap: Ovi's warm line, then back to the closet — nothing to
    // fix, the cap resets tomorrow and any work so far is already safe.
    case 'limitReached':
      return (
        <Notice line={limitLine}>
          <Button label={strings.common.continue} variant="secondary" onPress={done} />
        </Notice>
      );
    // Global AI brake: a gentle "back shortly", retryable — the flat-lay is safe.
    case 'aiPaused':
      return (
        <Notice line={strings.ovi.resting}>
          <Button label={strings.closet.retryCta} variant="secondary" onPress={retry} />
        </Notice>
      );
  }
}

interface InstructionProps {
  readonly onPick: (source: 'camera' | 'library') => void;
}

/**
 * The batch entry: the one instruction that makes segmentation work (lay pieces
 * flat, space between them, one photo), then the same two capture cards the single
 * add offers.
 */
function Instruction({ onPick }: InstructionProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.instruction}>
      <Text variant="body" color={colors.secondaryStrong} style={{ textAlign: 'center' }}>
        {strings.closet.bulkCapture.instruction}
      </Text>
      <SourceCard label={strings.closet.takePhoto} onPress={() => onPick('camera')} />
      <SourceCard label={strings.closet.pickPhoto} onPress={() => onPick('library')} />
    </View>
  );
}

interface BatchConfirmProps {
  readonly items: readonly BatchItem[];
  readonly failed: number;
  readonly onDone: () => void;
}

/**
 * The batch review: step through the segmented drafts one at a time, reusing
 * {@link ConfirmItem} wholesale for each (its own "Looks right" is the per-piece
 * confirm, flipping `tagsConfirmed`). Discarding a piece archives it — the same
 * path the detail sheet uses — and once at least one is reviewed a "Confirm the
 * rest" affordance confirms every remaining draft as it stands. When every piece
 * is resolved the flow hands back to the closet.
 */
function BatchConfirm({ items, failed, onDone }: BatchConfirmProps) {
  const { colors } = useTheme();
  const [resolved, setResolved] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState(false);

  const total = items.length;
  const current = items.find((item) => !resolved.has(item.id)) ?? null;
  // 1-based position of the piece under review (a11y + a quiet visible label).
  const position = resolved.size + 1;

  const resolve = useCallback((id: string) => {
    setResolved((prev) => new Set(prev).add(id));
  }, []);

  // Once no piece remains under review, the batch is done — return to the closet.
  useEffect(() => {
    if (current === null) onDone();
  }, [current, onDone]);

  const discard = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await archiveItem(id);
      } catch {
        // Archiving is best-effort; an unconfirmed draft left behind is harmless
        // and never blocks the review.
      }
      setBusy(false);
      resolve(id);
    },
    [resolve],
  );

  const confirmRest = useCallback(async () => {
    setBusy(true);
    const rest = items.filter((item) => !resolved.has(item.id));
    for (const item of rest) {
      try {
        await patchItem(item.id, { confirm: true });
      } catch {
        // A straggler that won't confirm stays an unconfirmed draft — safe, and
        // still addable from the closet.
      }
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusy(false);
    setResolved(new Set(items.map((item) => item.id)));
  }, [items, resolved]);

  if (current === null) return null; // onDone fires from the effect above.

  return (
    <View style={styles.batch}>
      <View style={styles.batchHeader}>
        <Text accessibilityRole="header" variant="title" size="title3" color={colors.text}>
          {strings.closet.bulkCapture.confirmTitle}
        </Text>
        <Text variant="body" color={colors.secondaryStrong}>
          {strings.closet.bulkCapture.confirmSubtitle}
        </Text>
        <Text
          variant="caption"
          accessibilityLabel={strings.closet.bulkCapture.itemPosition(position, total)}
          color={colors.secondaryStrong}
        >
          {strings.closet.bulkCapture.itemPosition(position, total)}
        </Text>
        {failed > 0 ? (
          <Text variant="caption" color={colors.secondaryStrong}>
            {strings.closet.bulkCapture.partialFailure}
          </Text>
        ) : null}
      </View>

      {/* One piece at a time — remounted per id so it re-reads its own crop/tags.
          Its "Looks right" button is the per-piece confirm; onSaved advances. */}
      <View style={styles.batchBody}>
        <ConfirmItem key={current.id} itemId={current.id} vision onSaved={() => resolve(current.id)} />
      </View>

      <View style={styles.batchFooter}>
        <Button
          label={strings.closet.archive}
          variant="ghost"
          onPress={() => void discard(current.id)}
          disabled={busy}
        />
        {resolved.size >= 1 ? (
          <Button
            label={strings.closet.bulkCapture.confirmRestCta}
            variant="secondary"
            onPress={() => void confirmRest()}
            disabled={busy}
          />
        ) : null}
      </View>
    </View>
  );
}

/** A single large source card with a selection tick on tap (mirrors the single add). */
function SourceCard({ label, onPress }: { readonly label: string; readonly onPress: () => void }) {
  const { colors, resolved } = useTheme();
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
        rnShadow('e2', resolved),
        { backgroundColor: colors.surface, borderColor: colors.hairline },
      ]}
    >
      <Text variant="ui" size="title3" weight={600} color={colors.text}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A centered spinner with an Ovi progress line (uploading / working). */
function Progress({ line }: { readonly line: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.text} />
      <Text variant="body" color={colors.secondaryStrong} style={{ textAlign: 'center' }}>
        {line}
      </Text>
    </View>
  );
}

/** A centered line plus its actions — the empty / dormant / failure / limit beats. */
function Notice({ line, children }: { readonly line: string; readonly children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.centered}>
      <Text variant="body" color={colors.text} style={{ textAlign: 'center' }}>
        {line}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  instruction: {
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
  batch: {
    flex: 1,
  },
  batchHeader: {
    paddingHorizontal: spacing.s6,
    paddingTop: spacing.s4,
    gap: spacing.s2,
  },
  batchBody: {
    flex: 1,
  },
  batchFooter: {
    paddingHorizontal: spacing.s6,
    paddingBottom: spacing.s4,
    gap: spacing.s3,
  },
});
