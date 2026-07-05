/**
 * OutfitCanvas — the interactive build surface: a 4:5 stage, a closet drawer to
 * pull pieces from, native drag/pinch/rotate per piece, and save + assign flows.
 *
 * Placements are the source of truth here (each {@link PlacedItem} commits its
 * transform back on gesture end). layerOrder is kept contiguous (0..n-1) so the
 * server contract (integer >= 0) always holds and the render order is just the
 * sorted array.
 *
 * SAVE composes a cover from the stage via react-native-view-shot `captureRef`
 * (deselecting first so the selection outline isn't baked in), uploads it to R2
 * through the presigned cover-url, then POSTs/PATCHes the outfit. A cover failure
 * is non-fatal — the outfit still saves, and its card falls back to member
 * thumbnails. On success it returns to the Design tab (which re-fetches on focus).
 *
 * REOPEN (`outfitId`) hydrates the stage from the saved transforms and layer
 * order; saving then PATCHes. ASSIGN-TO-ERA is offered once an outfit has an id.
 */
import { strings } from '@era/core/strings';
import { layout, spacing } from '@era/tokens';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { captureRef } from 'react-native-view-shot';

import { Button } from '@/components/Button';
import { Toast } from '@/components/closet';
import { fetchItems, type ItemWithDisplay } from '@/components/items';
import { trackOnce } from '@/lib/analytics';
import { useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

import { AssignEraSheet } from './AssignEraSheet';
import { CanvasStage } from './CanvasStage';
import { ClosetDrawer } from './ClosetDrawer';
import { SaveOutfitSheet } from './SaveOutfitSheet';
import { CENTER, DEFAULT_ADD_SCALE } from './constants';
import type { Placement } from './PlacedItem';
import {
  addOutfitToEra,
  createEra,
  createOutfit,
  fetchEras,
  fetchOutfitDetail,
  requestCoverUpload,
  updateOutfit,
  uploadCover,
  type EraSummary,
  type OutfitItemTransform,
  type OutfitSavePayload,
} from './api';

/** Await one paint so a deselect clears the outline before we capture. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Reassign layerOrder to a contiguous 0..n-1 by current order. */
function renumber(list: readonly Placement[]): Placement[] {
  return [...list]
    .sort((a, b) => a.layerOrder - b.layerOrder)
    .map((p, index) => ({ ...p, layerOrder: index }));
}

interface OutfitCanvasProps {
  /** Present when reopening an existing outfit; absent for a fresh build. */
  readonly outfitId?: string;
}

export function OutfitCanvas({ outfitId: initialOutfitId }: OutfitCanvasProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const reduced = useReducedMotionSafe();

  const [placements, setPlacements] = useState<readonly Placement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stage, setStage] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [items, setItems] = useState<readonly ItemWithDisplay[]>([]);
  const [eras, setEras] = useState<readonly EraSummary[]>([]);

  const [outfitId, setOutfitId] = useState<string | null>(initialOutfitId ?? null);
  const [name, setName] = useState('');
  const [occasion, setOccasion] = useState('');

  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [eraOpen, setEraOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const guideX = useSharedValue(0);
  const guideY = useSharedValue(0);
  const guideXPos = useSharedValue(CENTER);
  const guideYPos = useSharedValue(CENTER);
  const stageViewRef = useRef<View | null>(null);

  // Load the closet, the eras, and (when reopening) the outfit itself.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [closet, eraList] = await Promise.all([fetchItems(), fetchEras()]);
        if (!active) {
          return;
        }
        setItems(closet);
        setEras(eraList);
        if (initialOutfitId) {
          const detail = await fetchOutfitDetail(initialOutfitId);
          if (!active) {
            return;
          }
          setName(detail.name ?? '');
          setOccasion(detail.occasion ?? '');
          setPlacements(
            renumber(
              detail.items.map((member) => ({
                itemId: member.itemId,
                layerOrder: member.layerOrder,
                posX: member.posX,
                posY: member.posY,
                scale: member.scale,
                rotation: member.rotation,
                displayUrl: member.item.displayUrl,
                name: member.item.name,
              })),
            ),
          );
        }
      } catch {
        if (active) {
          setToast(strings.errors.generic);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [initialOutfitId]);

  const sorted = useMemo(
    () => [...placements].sort((a, b) => a.layerOrder - b.layerOrder),
    [placements],
  );
  const placedIds = useMemo(() => new Set(placements.map((p) => p.itemId)), [placements]);

  const onStageLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setStage({ w: width, h: height });
  }, []);

  const addItem = useCallback((item: ItemWithDisplay) => {
    setPlacements((prev) => {
      if (prev.some((p) => p.itemId === item.id)) {
        return prev;
      }
      const next: Placement = {
        itemId: item.id,
        layerOrder: prev.length,
        posX: CENTER,
        posY: CENTER,
        scale: DEFAULT_ADD_SCALE,
        rotation: 0,
        displayUrl: item.displayUrl,
        name: item.name,
      };
      return [...prev, next];
    });
    setSelectedId(item.id);
  }, []);

  const commit = useCallback((itemId: string, transform: OutfitItemTransform) => {
    setPlacements((prev) =>
      prev.map((p) =>
        p.itemId === itemId
          ? { ...p, posX: transform.posX, posY: transform.posY, scale: transform.scale, rotation: transform.rotation }
          : p,
      ),
    );
  }, []);

  // Step the selected piece one place up/down the stack by swapping layerOrder
  // with its neighbour in the sorted order.
  const restack = useCallback((itemId: string, direction: 1 | -1) => {
    setPlacements((prev) => {
      const ordered = [...prev].sort((a, b) => a.layerOrder - b.layerOrder);
      const index = ordered.findIndex((p) => p.itemId === itemId);
      const swapWith = index + direction;
      if (index < 0 || swapWith < 0 || swapWith >= ordered.length) {
        return prev;
      }
      const a = ordered[index];
      const b = ordered[swapWith];
      if (!a || !b) {
        return prev;
      }
      return prev.map((p) => {
        if (p.itemId === a.itemId) {
          return { ...p, layerOrder: b.layerOrder };
        }
        if (p.itemId === b.itemId) {
          return { ...p, layerOrder: a.layerOrder };
        }
        return p;
      });
    });
    void Haptics.selectionAsync();
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setPlacements((prev) => renumber(prev.filter((p) => p.itemId !== itemId)));
    setSelectedId((current) => (current === itemId ? null : current));
  }, []);

  /** Compose a cover from the stage and upload it; null on any failure (non-fatal). */
  const composeCover = useCallback(async (): Promise<string | null> => {
    try {
      const uri = await captureRef(stageViewRef, { format: 'png', result: 'tmpfile' });
      const target = await requestCoverUpload('png', 'image/png');
      await uploadCover(target.url, uri, 'image/png');
      return target.key;
    } catch {
      return null;
    }
  }, []);

  const handleSave = useCallback(
    async (nextName: string, nextOccasion: string) => {
      if (placements.length === 0 || saving) {
        return;
      }
      setSaving(true);
      setName(nextName);
      setOccasion(nextOccasion);

      // Deselect and let one frame paint so the outline isn't in the capture.
      setSelectedId(null);
      await nextFrame();
      const coverImagePath = await composeCover();

      const itemsPayload: OutfitItemTransform[] = placements.map((p) => ({
        itemId: p.itemId,
        layerOrder: p.layerOrder,
        posX: p.posX,
        posY: p.posY,
        scale: p.scale,
        rotation: p.rotation,
      }));
      const payload: OutfitSavePayload = {
        items: itemsPayload,
        name: nextName.length > 0 ? nextName : null,
        occasion: nextOccasion.length > 0 ? nextOccasion : null,
        ...(coverImagePath ? { coverImagePath } : {}),
      };

      try {
        if (outfitId) {
          await updateOutfit(outfitId, payload);
        } else {
          const created = await createOutfit(payload);
          // Hold the new id so a re-save PATCHes and "add to an era" unlocks.
          setOutfitId(created.id);
          // Funnel: the user's first-ever saved outfit (best-effort once).
          void trackOnce('first_outfit_saved');
        }
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSaveOpen(false);
        setSaving(false);
        setToast(strings.design.outfitSaved);
      } catch {
        setSaving(false);
        setToast(strings.errors.generic);
      }
    },
    [placements, saving, outfitId, composeCover],
  );

  const assignToEra = useCallback(
    async (eraId: string) => {
      if (!outfitId || assignBusy) {
        return;
      }
      setAssignBusy(true);
      try {
        await addOutfitToEra(eraId, outfitId);
        setEraOpen(false);
        setToast(strings.design.addedToEra);
      } catch {
        setToast(strings.errors.generic);
      } finally {
        setAssignBusy(false);
      }
    },
    [outfitId, assignBusy],
  );

  const createAndAssign = useCallback(
    async (title: string) => {
      if (!outfitId || assignBusy || title.length === 0) {
        return;
      }
      setAssignBusy(true);
      try {
        const era = await createEra(title);
        await addOutfitToEra(era.id, outfitId);
        setEras(await fetchEras());
        setEraOpen(false);
        setToast(strings.design.addedToEra);
      } catch {
        setToast(strings.errors.generic);
      } finally {
        setAssignBusy(false);
      }
    },
    [outfitId, assignBusy],
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.text} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Button
          label={outfitId ? strings.design.done : strings.common.cancel}
          variant="ghost"
          onPress={() => router.back()}
        />
        {outfitId ? (
          <Button
            label={strings.design.assignToEra}
            variant="ghost"
            onPress={() => setEraOpen(true)}
          />
        ) : null}
      </View>

      <View style={styles.stageArea}>
        <CanvasStage
          placements={sorted}
          selectedId={selectedId}
          stage={stage}
          onStageLayout={onStageLayout}
          reduced={reduced}
          onSelect={setSelectedId}
          onCommit={commit}
          onBringForward={(id) => restack(id, 1)}
          onSendBack={(id) => restack(id, -1)}
          onRemove={removeItem}
          guideX={guideX}
          guideY={guideY}
          guideXPos={guideXPos}
          guideYPos={guideYPos}
          stageViewRef={stageViewRef}
        />
      </View>

      <View style={styles.bottomBar}>
        <Button
          label={strings.design.addFromCloset}
          variant="secondary"
          onPress={() => setDrawerOpen(true)}
          style={styles.bottomButton}
        />
        <Button
          label={strings.design.saveOutfit}
          onPress={() => setSaveOpen(true)}
          disabled={placements.length === 0}
          style={styles.bottomButton}
        />
      </View>

      <ClosetDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={items}
        placedIds={placedIds}
        onAdd={addItem}
      />

      <SaveOutfitSheet
        open={saveOpen}
        onClose={() => (saving ? undefined : setSaveOpen(false))}
        initialName={name}
        initialOccasion={occasion}
        saving={saving}
        onSave={handleSave}
      />

      <AssignEraSheet
        open={eraOpen}
        onClose={() => setEraOpen(false)}
        eras={eras}
        busy={assignBusy}
        onAssign={assignToEra}
        onCreateAndAssign={createAndAssign}
      />

      <Toast
        message={toast}
        onHide={() => setToast(null)}
        bottom={layout.touchTarget.ios + spacing.s8}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s2,
  },
  stageArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.s4,
  },
  bottomBar: {
    flexDirection: 'row',
    gap: spacing.s3,
    paddingHorizontal: spacing.s4,
    paddingBottom: spacing.s2,
  },
  bottomButton: {
    flex: 1,
  },
});
