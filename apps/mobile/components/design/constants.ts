/**
 * Outfit-canvas constants — all derived from design tokens or the pinned server
 * transform contract, never raw design literals. The canvas stores placements in
 * the same normalized shape the API validates (`parseOutfitItems`): posX/posY in
 * 0..1, scale 0.05..10, rotation in degrees, layerOrder an integer.
 */
import { spacing } from '@era/tokens';

/** Transform bounds — mirror the server contract in `outfit-server.ts`. */
export const SCALE_MIN = 0.05;
export const SCALE_MAX = 10;
export const ROTATION_MIN = -360;
export const ROTATION_MAX = 360;

/** Stage aspect (width / height) — a 4:5 portrait card. */
export const STAGE_ASPECT = 4 / 5;

/**
 * A placed item's on-stage box at scale 1 spans the full stage width; the default
 * add scale drops it to a comfortable ~40% so a fresh piece lands mid-stage with
 * room to arrange around it.
 */
export const BASE_ITEM_FRACTION = 1;
export const DEFAULT_ADD_SCALE = 0.4;

/** A newly added piece lands dead-centre. */
export const CENTER = 0.5;

/**
 * Snap distance: a dragged item's centre snaps to the stage centre-line once it
 * comes within this many px. Token-derived (one 4pt step past a base gap) so the
 * snap feels intentional, not twitchy.
 */
export const SNAP_THRESHOLD_PX = spacing.s4;
