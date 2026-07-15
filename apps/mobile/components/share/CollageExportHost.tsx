/**
 * CollageExportHost — the offscreen renderer + one-tap export orchestrator.
 *
 * Mounts the requested share template absolutely off-viewport (`left: -10000`),
 * prefetches its imagery, waits for the template's per-image readiness callback
 * (or a {@link READINESS_TIMEOUT_MS} fallback so the button never hangs), captures
 * it to a 1080×1920 PNG, and opens the native share sheet — then unmounts. A
 * single `captured` guard makes readiness-vs-timeout a race that fires capture
 * exactly once. Provides {@link useCollageExport} to any descendant.
 *
 * Mounted once, high in the tree (the root layout), so the outfit canvas, the
 * worn recap, and the era rail all share one host and one `busy` lock — no
 * template renders on-screen and no double export can start.
 */
import type { MonthlyRecap } from '@era/core/wear-stats';
import { strings } from '@era/core/strings';
import { Image } from 'expo-image';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { StyleSheet, View } from 'react-native';

import {
  captureAndShare,
  collageImageUrls,
  recapShareModel,
  recapThumbUrls,
  READINESS_TIMEOUT_MS,
  type EraShareInput,
  type OutfitShareInput,
  type RecapShareItem,
  type RecapShareModel,
} from '@/lib/share-collage';

import { EraStoryCard } from './EraStoryCard';
import { OutfitStoryCard } from './OutfitStoryCard';
import { RecapStoryCard } from './RecapStoryCard';

interface CollageExportApi {
  readonly exportOutfit: (input: OutfitShareInput) => void;
  readonly exportEra: (input: EraShareInput) => void;
  readonly exportRecap: (recap: MonthlyRecap, monthLabel: string, items: readonly RecapShareItem[]) => void;
  readonly busy: boolean;
}

const CollageExportContext = createContext<CollageExportApi | null>(null);

/** The active export request — which template to mount offscreen, with its data. */
type ExportRequest =
  | { readonly kind: 'outfit'; readonly input: OutfitShareInput }
  | { readonly kind: 'era'; readonly input: EraShareInput }
  | { readonly kind: 'recap'; readonly model: RecapShareModel; readonly items: readonly RecapShareItem[] };

export function CollageExportHost({ children }: PropsWithChildren) {
  const [request, setRequest] = useState<ExportRequest | null>(null);
  const [busy, setBusy] = useState(false);

  const viewRef = useRef<View | null>(null);
  const busyRef = useRef(false);
  const capturedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef<ExportRequest | null>(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    clearTimer();
    requestRef.current = null;
    busyRef.current = false;
    setRequest(null);
    setBusy(false);
  }, [clearTimer]);

  // Capture the mounted template once — whichever of readiness / timeout wins.
  const runCapture = useCallback(async () => {
    if (capturedRef.current) {
      return;
    }
    capturedRef.current = true;
    clearTimer();
    await captureAndShare(viewRef, { dialogTitle: dialogTitleFor(requestRef.current) });
    finish();
  }, [clearTimer, finish]);

  const begin = useCallback(
    (next: ExportRequest, prefetch: readonly string[]) => {
      if (busyRef.current) {
        return;
      }
      busyRef.current = true;
      capturedRef.current = false;
      requestRef.current = next;
      setBusy(true);
      setRequest(next);
      if (prefetch.length > 0) {
        void Image.prefetch([...prefetch]);
      }
      timeoutRef.current = setTimeout(() => {
        void runCapture();
      }, READINESS_TIMEOUT_MS);
    },
    [runCapture],
  );

  const exportOutfit = useCallback(
    (input: OutfitShareInput) => {
      begin({ kind: 'outfit', input }, collageImageUrls({ coverUrl: input.coverUrl, tileUrls: input.cutoutUrls }));
    },
    [begin],
  );

  const exportEra = useCallback(
    (input: EraShareInput) => {
      begin({ kind: 'era', input }, collageImageUrls({ coverUrl: input.coverUrl, tileUrls: input.outfitCovers }));
    },
    [begin],
  );

  const exportRecap = useCallback(
    (recap: MonthlyRecap, monthLabel: string, items: readonly RecapShareItem[]) => {
      const model = recapShareModel(recap, monthLabel);
      begin({ kind: 'recap', model, items }, recapThumbUrls(model.topItems, items));
    },
    [begin],
  );

  // Never leave a timer running if the host unmounts mid-export.
  useEffect(() => clearTimer, [clearTimer]);

  const api = useMemo<CollageExportApi>(
    () => ({ exportOutfit, exportEra, exportRecap, busy }),
    [exportOutfit, exportEra, exportRecap, busy],
  );

  return (
    <CollageExportContext.Provider value={api}>
      {children}
      {request !== null ? (
        <View style={styles.offscreen} pointerEvents="none" collapsable={false}>
          {request.kind === 'outfit' ? (
            <OutfitStoryCard input={request.input} viewRef={viewRef} onAllImagesLoaded={() => void runCapture()} />
          ) : request.kind === 'era' ? (
            <EraStoryCard input={request.input} viewRef={viewRef} onAllImagesLoaded={() => void runCapture()} />
          ) : (
            <RecapStoryCard
              model={request.model}
              items={request.items}
              viewRef={viewRef}
              onAllImagesLoaded={() => void runCapture()}
            />
          )}
        </View>
      ) : null}
    </CollageExportContext.Provider>
  );
}

/** Read the export API. Throws if no {@link CollageExportHost} is mounted above. */
export function useCollageExport(): CollageExportApi {
  const ctx = useContext(CollageExportContext);
  if (ctx === null) {
    throw new Error('useCollageExport must be used within a CollageExportHost');
  }
  return ctx;
}

/** The share-sheet title (Android/web) for the active request. */
function dialogTitleFor(request: ExportRequest | null): string {
  switch (request?.kind) {
    case 'era':
      return strings.share.shareEra;
    case 'recap':
      return strings.share.shareMonth;
    default:
      return strings.share.shareLook;
  }
}

const styles = StyleSheet.create({
  // Mounted in the tree (so it lays out and paints) but far off-viewport.
  offscreen: {
    position: 'absolute',
    left: -10000,
    top: 0,
  },
});
