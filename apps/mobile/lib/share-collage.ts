/**
 * share-collage — compose a share-ready 1080×1920 PNG from an on-screen template
 * and hand it to the native share sheet.
 *
 * Split by purity so the whole file loads under the plain Node strip-types test
 * runner: the pure half (URL selection + the recap → template-props mapping)
 * carries no React-Native dependency and is unit-tested in `share-collage.test.ts`;
 * the impure `captureAndShare` lazy-imports the native modules
 * (`react-native-view-shot`, `expo-sharing`) inside the async body, so importing
 * this module never pulls a native binding into Node. Every top-level import here
 * is type-only and erased at strip time.
 *
 * The capture path is the <2s critical surface: the caller prefetches the URLs
 * `collageImageUrls`/`recapThumbUrls` return and gates the template on per-image
 * load before invoking `captureAndShare`, which resizes the logical template to
 * exact pixels via view-shot's `width`/`height` and opens the share sheet.
 */
import type { RefObject } from 'react';
import type { View } from 'react-native';
import type { MonthlyRecap, RecapBestValue, RecapTopItem } from '@era/core/wear-stats';

/** The item-category enum, borrowed off the recap types so mobile needn't dep `@era/db`. */
type RecapCategory = RecapTopItem['category'];

// -----------------------------------------------------------------------------
// Output geometry
// -----------------------------------------------------------------------------

/** Story/TikTok canvas — the exact pixel size view-shot resizes the capture to. */
export const SHARE_PIXEL_WIDTH = 1080;
export const SHARE_PIXEL_HEIGHT = 1920;

/** How long the host waits on image readiness before capturing anyway (never hang). */
export const READINESS_TIMEOUT_MS = 4000;

/** Most cutout/cover tiles a collage renders when there is no single cover. */
export const MAX_COLLAGE_TILES = 4;

/** Most-worn thumbnails the recap card shows in its top row. */
export const MAX_RECAP_THUMBS = 3;

// -----------------------------------------------------------------------------
// Pure: which image URLs a template will render (→ prefetch + readiness count)
// -----------------------------------------------------------------------------

/** A single composed cover wins; otherwise up to {@link MAX_COLLAGE_TILES} tiles. */
export interface CollageImageInput {
  readonly coverUrl?: string | null;
  readonly tileUrls?: readonly (string | null | undefined)[];
}

/** What the outfit share card renders — a cover (or garment cutouts) + caption. */
export interface OutfitShareInput {
  readonly coverUrl: string | null;
  readonly cutoutUrls: readonly (string | null)[];
  readonly name: string | null;
  readonly occasion: string | null;
}

/** What the era share card renders — a title, up to four outfit covers, a season. */
export interface EraShareInput {
  readonly title: string;
  readonly coverUrl: string | null;
  readonly outfitCovers: readonly (string | null)[];
  readonly season: string | null;
}

/**
 * The image URLs a cover/collage template actually renders — and therefore the
 * exact set to prefetch and gate capture on. A non-empty cover collapses to a
 * single URL; with no cover, the first {@link MAX_COLLAGE_TILES} non-empty tile
 * URLs, de-duplicated with input order preserved. Whitespace-only and null
 * entries are dropped, so the count is honest for the readiness gate.
 */
export function collageImageUrls(input: CollageImageInput): readonly string[] {
  const cover = input.coverUrl?.trim();
  if (cover) {
    return [cover];
  }
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const raw of input.tileUrls ?? []) {
    const url = raw?.trim();
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    urls.push(url);
    if (urls.length >= MAX_COLLAGE_TILES) {
      break;
    }
  }
  return urls;
}

/** The minimal item shape the recap card resolves a top piece's thumb + name from. */
export interface RecapShareItem {
  readonly id: string;
  readonly name: string;
  readonly imageUrl: string | null;
}

/**
 * The resolved cutout URLs for a recap's top pieces, in ranking order — the set
 * to prefetch and gate the recap card on. Items missing from `items` or without a
 * cutout are skipped (they render as a quiet placeholder, no image to wait on),
 * and URLs are de-duplicated so a piece sharing a thumb never double-counts.
 */
export function recapThumbUrls(
  topItems: readonly RecapTopItem[],
  items: readonly RecapShareItem[],
): readonly string[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const top of topItems) {
    const url = byId.get(top.itemId)?.imageUrl?.trim();
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

// -----------------------------------------------------------------------------
// Pure: MonthlyRecap → recap-card template props
// -----------------------------------------------------------------------------

/**
 * The recap card's props — a straight reshape of {@link MonthlyRecap} plus the
 * already-formatted month label, with the most-worn ranking capped to
 * {@link MAX_RECAP_THUMBS}. Every field is one the recap engine actually returns;
 * nothing is invented, and an empty month is flagged (`isEmpty`) rather than
 * padded, so the entry point can refuse to offer an empty share.
 */
export interface RecapShareModel {
  readonly monthLabel: string;
  readonly isEmpty: boolean;
  readonly totalWears: number;
  readonly distinctDaysWorn: number;
  readonly daysInMonth: number;
  readonly topItems: readonly RecapTopItem[];
  readonly mostWornCategory: RecapCategory | null;
  readonly bestCostPerWear: RecapBestValue | null;
}

/**
 * Map a month's recap to the share card's props. Pure: takes the recap and an
 * already-formatted month label (the caller owns `Intl`-free formatting) and
 * returns the render-ready model, trimming the most-worn ranking to the top
 * {@link MAX_RECAP_THUMBS}. A zero-wear month yields `isEmpty: true`.
 */
export function recapShareModel(recap: MonthlyRecap, monthLabel: string): RecapShareModel {
  return {
    monthLabel,
    isEmpty: recap.totalWears === 0,
    totalWears: recap.totalWears,
    distinctDaysWorn: recap.distinctDaysWorn,
    daysInMonth: recap.daysInMonth,
    topItems: recap.topItems.slice(0, MAX_RECAP_THUMBS),
    mostWornCategory: recap.mostWornCategory,
    bestCostPerWear: recap.bestCostPerWear,
  };
}

// -----------------------------------------------------------------------------
// Impure: capture + share (lazy-imports native; never runs under the test runner)
// -----------------------------------------------------------------------------

/** How a capture-and-share attempt resolved — never throws to the caller. */
export type CaptureShareStatus = 'shared' | 'unavailable' | 'error';

export interface CaptureShareResult {
  readonly status: CaptureShareStatus;
}

export interface CaptureShareOptions {
  /** Android/web share-sheet title (iOS ignores it). */
  readonly dialogTitle?: string;
}

/** One paint before capture so the offscreen template is laid out, not blank. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Capture the referenced template View as a 1080×1920 PNG and open the native
 * share sheet on it. The native modules are imported lazily so this file stays
 * Node-loadable; view-shot writes a tmpfile and resizes to the exact Story pixels,
 * and `expo-sharing` (which, unlike RN's `Share`, shares a file URL on both iOS
 * and Android) presents the sheet. Returns a typed status and never throws: a
 * missing sharing capability is `'unavailable'`, any failure is `'error'`, and a
 * user dismissing the sheet resolves `'shared'` (the file was handed off). Logs
 * the export duration in `__DEV__` only.
 */
export async function captureAndShare(
  ref: RefObject<View | null>,
  options: CaptureShareOptions = {},
): Promise<CaptureShareResult> {
  const startedAt = performance.now();
  try {
    const [{ captureRef }, Sharing] = await Promise.all([
      import('react-native-view-shot'),
      import('expo-sharing'),
    ]);

    if (!(await Sharing.isAvailableAsync())) {
      return { status: 'unavailable' };
    }

    // One frame so the just-mounted offscreen template has painted before capture.
    await nextFrame();

    const uri = await captureRef(ref, {
      format: 'png',
      result: 'tmpfile',
      width: SHARE_PIXEL_WIDTH,
      height: SHARE_PIXEL_HEIGHT,
    });

    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      UTI: 'public.png',
      ...(options.dialogTitle ? { dialogTitle: options.dialogTitle } : {}),
    });

    if (__DEV__) {
      console.log(`[era-share] exported in ${Math.round(performance.now() - startedAt)}ms`);
    }
    return { status: 'shared' };
  } catch {
    return { status: 'error' };
  }
}
