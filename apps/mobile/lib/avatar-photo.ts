/**
 * Avatar onboarding — the PURE photo-step logic, split out from the React screen
 * so it is data-in/data-out and node-testable (no expo-image SDK, no device).
 *
 * Two concerns live here:
 *   - {@link avatarResizeActions} decides the expo-image-manipulator resize action
 *     for one picked photo: downscale so the LONG edge is at most {@link
 *     MAX_AVATAR_EDGE}, scaling proportionally (never distorting). The re-encode
 *     that the caller pairs with this is what strips EXIF/GPS — reusing the exact
 *     AddItemFlow idiom (manipulateAsync → JPEG), no new deps. The returned shape
 *     is the manipulator's own `{ resize: { width | height } }` action, kept as a
 *     plain object so this module imports nothing device-bound.
 *   - the picked-list helpers ({@link addAvatarPhoto}/{@link removeAvatarPhotoAt}
 *     + the count guards) enforce the 1–3 photo bound the create call requires,
 *     de-duping by uri so the same asset can't be added twice.
 *
 * FASHN Model Creation takes 1–3 photos; one is enough to build the likeness and
 * three is the useful ceiling, so the screen gates "continue" on {@link
 * canCreateAvatar} and "add another" on {@link canAddAvatarPhoto}.
 */

/** Longest-edge cap for an avatar source photo (px). Matches the closet upload cap. */
export const MAX_AVATAR_EDGE = 1600;

/** FASHN Model Creation accepts at most three source photos. */
export const MAX_AVATAR_PHOTOS = 3;

/** At least one photo is required to build the likeness. */
export const MIN_AVATAR_PHOTOS = 1;

/** One resize action in expo-image-manipulator's shape (proportional by one edge). */
export type ResizeAction = { readonly resize: { readonly width: number } | { readonly height: number } };

/**
 * The manipulator actions that downscale a picked photo to a {@link MAX_AVATAR_EDGE}
 * long edge, scaling proportionally off whichever edge is longer. Returns `[]` when
 * the photo is already within the cap or its dimensions are unknown — in that case
 * the caller still re-encodes (which is what strips EXIF), it just doesn't resize.
 */
export function avatarResizeActions(width: number, height: number): ResizeAction[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return [];
  }
  const longEdge = Math.max(width, height);
  if (longEdge <= MAX_AVATAR_EDGE) {
    return [];
  }
  // Scale off the longer edge so the result fits the cap without distortion.
  return width >= height
    ? [{ resize: { width: MAX_AVATAR_EDGE } }]
    : [{ resize: { height: MAX_AVATAR_EDGE } }];
}

/** One source photo the user picked, before it's uploaded (identified by its local uri). */
export interface AvatarPhoto {
  readonly uri: string;
}

/**
 * Append a picked photo, capped at {@link MAX_AVATAR_PHOTOS} and de-duped by uri.
 * Returns the same list unchanged when it's full or the uri is already present, so
 * a double-tap or a re-pick can't push past the bound or double-count.
 */
export function addAvatarPhoto(list: readonly AvatarPhoto[], uri: string): AvatarPhoto[] {
  if (list.length >= MAX_AVATAR_PHOTOS) return [...list];
  if (list.some((photo) => photo.uri === uri)) return [...list];
  return [...list, { uri }];
}

/** Remove the photo at `index` (out-of-range indices are a no-op copy). */
export function removeAvatarPhotoAt(list: readonly AvatarPhoto[], index: number): AvatarPhoto[] {
  if (index < 0 || index >= list.length) return [...list];
  return list.filter((_, i) => i !== index);
}

/** True while another photo can still be added (under the {@link MAX_AVATAR_PHOTOS} cap). */
export function canAddAvatarPhoto(list: readonly AvatarPhoto[]): boolean {
  return list.length < MAX_AVATAR_PHOTOS;
}

/** True once enough photos are picked to build the avatar ({@link MIN_AVATAR_PHOTOS}+). */
export function canCreateAvatar(list: readonly AvatarPhoto[]): boolean {
  return list.length >= MIN_AVATAR_PHOTOS;
}
