/**
 * CanvasStage — the 4:5 outfit stage: background, placed pieces, snap guides, and
 * the selected piece's control row.
 *
 * The capture target (`stageViewRef`) wraps ONLY the stage background and the
 * placed pieces, so a composed cover excludes the snap guides, the selection
 * outline, and the control row (the orchestrator also deselects before capturing).
 * Pieces render sorted by layerOrder — the array order the orchestrator maintains.
 *
 * Snap guides are two centre-lines whose opacity is driven by the shared guideX /
 * guideY values a dragging {@link PlacedItem} raises; they need no re-render.
 */
import { strings } from '@era/core/strings';
import { glass, radii, spacing, typeRamp } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { type RefObject } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { useTheme } from '@/lib/theme';

import { PlacedItem, type Placement } from './PlacedItem';
import { STAGE_ASPECT } from './constants';
import type { OutfitItemTransform } from './api';

interface CanvasStageProps {
  readonly placements: readonly Placement[];
  readonly selectedId: string | null;
  readonly stage: { readonly w: number; readonly h: number };
  readonly onStageLayout: (event: LayoutChangeEvent) => void;
  readonly reduced: boolean;
  readonly onSelect: (itemId: string) => void;
  readonly onCommit: (itemId: string, next: OutfitItemTransform) => void;
  readonly onBringForward: (itemId: string) => void;
  readonly onSendBack: (itemId: string) => void;
  readonly onRemove: (itemId: string) => void;
  readonly guideX: SharedValue<number>;
  readonly guideY: SharedValue<number>;
  /** Normalized (0..1) position each guide draws at — centre-line or a piece. */
  readonly guideXPos: SharedValue<number>;
  readonly guideYPos: SharedValue<number>;
  /** Capture target for the composed cover — wraps the background + pieces only. */
  readonly stageViewRef: RefObject<View | null>;
}

export function CanvasStage({
  placements,
  selectedId,
  stage,
  onStageLayout,
  reduced,
  onSelect,
  onCommit,
  onBringForward,
  onSendBack,
  onRemove,
  guideX,
  guideY,
  guideXPos,
  guideYPos,
  stageViewRef,
}: CanvasStageProps) {
  const { colors } = useTheme();

  // The guides ride the shared values a dragging piece raises: opacity gates
  // visibility, position places the line on the centre-line or a piece's centre.
  const guideXStyle = useAnimatedStyle(() => ({
    opacity: guideX.value,
    left: guideXPos.value * stage.w,
  }));
  const guideYStyle = useAnimatedStyle(() => ({
    opacity: guideY.value,
    top: guideYPos.value * stage.h,
  }));

  return (
    <View style={styles.stageWrap} onLayout={onStageLayout}>
      {/* Capture target: background + pieces, nothing chrome. */}
      <View
        ref={stageViewRef}
        collapsable={false}
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: colors.surface,
            borderRadius: radii.hero,
            borderColor: colors.hairline,
          },
        ]}
      >
        {placements.length === 0 ? (
          <View style={styles.emptyHint}>
            <Text
              style={{
                color: colors.secondaryStrong,
                fontSize: typeRamp.body.pt,
                lineHeight: typeRamp.body.lineHeight,
                textAlign: 'center',
              }}
            >
              {strings.design.canvasEmptyHint}
            </Text>
          </View>
        ) : null}

        {placements.map((placement) => (
          <PlacedItem
            key={placement.itemId}
            placement={placement}
            stage={stage}
            selected={placement.itemId === selectedId}
            reduced={reduced}
            onSelect={onSelect}
            onCommit={onCommit}
            others={placements
              .filter((p) => p.itemId !== placement.itemId)
              .map((p) => ({ posX: p.posX, posY: p.posY }))}
            guideX={guideX}
            guideY={guideY}
            guideXPos={guideXPos}
            guideYPos={guideYPos}
          />
        ))}
      </View>

      {/* Snap guides — overlay, excluded from the capture. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.guideV, { backgroundColor: colors.accent }, guideXStyle]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.guideH, { backgroundColor: colors.accent }, guideYStyle]}
      />

      {/* Control row for the selected piece — layer order + remove. */}
      {selectedId ? (
        <View style={[styles.controls, { backgroundColor: colors.bg, borderColor: colors.hairline }]}>
          <ControlButton label="Send back" onPress={() => onSendBack(selectedId)} colors={colors} />
          <ControlButton label="Bring forward" onPress={() => onBringForward(selectedId)} colors={colors} />
          <ControlButton
            label="Remove"
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onRemove(selectedId);
            }}
            colors={colors}
            danger
          />
        </View>
      ) : null}
    </View>
  );
}

interface ControlButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly colors: ReturnType<typeof useTheme>['colors'];
  readonly danger?: boolean;
}

function ControlButton({ label, onPress, colors, danger = false }: ControlButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={spacing.s2}
      onPress={onPress}
      style={styles.control}
    >
      <Text
        style={{
          color: danger ? colors.danger : colors.text,
          fontSize: typeRamp.footnote.pt,
          lineHeight: typeRamp.footnote.lineHeight,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stageWrap: {
    width: '100%',
    aspectRatio: STAGE_ASPECT,
    borderCurve: 'continuous',
  },
  emptyHint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.s8,
  },
  guideV: {
    // `left` is supplied per-drag by the animated style (the snapped x).
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
  },
  guideH: {
    // `top` is supplied per-drag by the animated style (the snapped y).
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  controls: {
    position: 'absolute',
    top: spacing.s3,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: spacing.s4,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s4,
    borderRadius: radii.input,
    borderWidth: glass.borderWidth,
    borderCurve: 'continuous',
  },
  control: {
    paddingVertical: spacing.s1,
  },
});
