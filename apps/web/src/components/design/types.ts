/**
 * Shapes + geometry for the outfit canvas.
 *
 * The item transforms here (posX/posY/scale/rotation/layerOrder) are DATA — the
 * pinned outfit_items contract — not design tokens. They describe WHERE a piece
 * sits on the stage in normalized space, so nothing here reads a `var(--…)`:
 * these are coordinates, not dimensions. The visual chrome (surfaces, spacing,
 * motion) is what stays token-driven, in the components that render this data.
 */

/** One cutout placed on the stage. `itemId` is unique per outfit (the PK). */
export interface PlacedItem {
  itemId: string;
  name: string;
  category: string;
  displayUrl: string | null;
  /** z-order — higher renders on top. Contract: integer >= 0. */
  layerOrder: number;
  /** Center X in stage space, 0..1. */
  posX: number;
  /** Center Y in stage space, 0..1. */
  posY: number;
  /** Width as a fraction of the stage width (scale 1 = full stage width). 0.05..10. */
  scale: number;
  /** Rotation in degrees, -360..360. */
  rotation: number;
}

/** A saved outfit as GET /api/outfits lists it (for the Design tab grid). */
export interface OutfitSummary {
  id: string;
  name: string | null;
  occasion: string | null;
  coverUrl: string | null;
  itemCount: number;
  thumbnailUrls: string[];
  /** The caller's live feed post for this outfit, or null when it isn't shared. */
  sharedPostId: string | null;
}

/** An era as GET /api/eras lists it (for the Design tab era section). */
export interface EraSummary {
  id: string;
  title: string;
  description: string | null;
  season: string | null;
  coverUrl: string | null;
  outfitCount: number;
  outfitCovers: string[];
  /** The caller's live feed post for this era, or null when it isn't shared. */
  sharedPostId: string | null;
}

/** One member in the GET /api/outfits/[id] reopen payload. */
export interface OutfitDetailMember {
  itemId: string;
  layerOrder: number;
  posX: number;
  posY: number;
  scale: number;
  rotation: number;
  item: { name: string; category: string; displayUrl: string | null };
}

/** The GET /api/outfits/[id] reopen payload the canvas hydrates from. */
export interface OutfitDetail {
  id: string;
  name: string | null;
  occasion: string | null;
  coverUrl: string | null;
  items: OutfitDetailMember[];
  /** The caller's live feed post for this outfit, or null when it isn't shared. */
  sharedPostId: string | null;
}

// --- Canvas geometry — normalized math, not design tokens ---

/** Stage aspect (width / height): the outfit "paper" is a 4:5 portrait card. */
export const STAGE_ASPECT = 4 / 5;
/** Stage center on both axes. */
export const CENTER = 0.5;
/** A freshly added piece lands centered at 40% of the stage width. */
export const DEFAULT_SCALE = 0.4;
/** Normalized distance at which a moving center snaps to a guide. */
export const SNAP_THRESHOLD = 0.02;
/** Contract bounds for a piece's scale (fraction of stage width). */
export const SCALE_MIN = 0.05;
export const SCALE_MAX = 10;
/** Step used by the scale +/- controls. */
export const SCALE_STEP = 0.05;
/** Contract bounds for rotation (degrees). */
export const ROTATION_MIN = -360;
export const ROTATION_MAX = 360;
/** Step used by the rotate controls (degrees). */
export const ROTATION_STEP = 15;
/** Contract cap on pieces per outfit. */
export const MAX_ITEMS = 30;
/** Long-edge pixel resolution used when composing the exported cover. */
export const EXPORT_WIDTH = 1080;

/** Clamp a number into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
