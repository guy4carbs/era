/**
 * Pure presentation helpers for the public-profile page — the SEO-facing derived
 * strings (page `<title>`, image `alt`) and the single "thin" threshold that
 * decides whether a public profile is indexable.
 *
 * Kept free of any server-only import (no `@era/db`, no R2) so it is safe to
 * reach from anywhere and trivially unit-testable. Copy that a viewer READS lives
 * in `@era/core` `strings.profile`; this module only computes the SEO metadata
 * derived from a profile's own fields.
 */

/**
 * The minimum number of public (non-archived) pieces a profile needs before it
 * earns a place in the index / sitemap. Below this it is "thin": the page still
 * renders and is shareable, but ships `noindex` so near-empty profiles never
 * dilute Era in search. Shared by the page (per-render), the loader's sitemap
 * query, and the tests so there is ONE definition of the bar.
 */
export const PUBLIC_PROFILE_MIN_ITEMS = 5;

/** The minimal identity a presenter helper needs — a subset of the loader's identity. */
export interface ProfileNameParts {
  readonly displayName: string | null;
  readonly username: string;
}

/**
 * The human name for a profile: the trimmed display name, or the bare username
 * when there is no display name yet. Never returns an empty string.
 */
export function profileName(identity: ProfileNameParts): string {
  const displayName = identity.displayName?.trim();
  return displayName && displayName.length > 0 ? displayName : identity.username;
}

/**
 * The SEO `<title>` for a profile — `"Display Name (@username)"`, or just
 * `"@username"` when there is no display name. Hard-capped at 60 chars (the
 * house SEO budget) with an ellipsis so a long display name never overruns.
 */
export function profileTitle(identity: ProfileNameParts): string {
  const handle = `@${identity.username}`;
  const displayName = identity.displayName?.trim();
  const full = displayName && displayName.length > 0 ? `${displayName} (${handle})` : handle;
  return full.length <= 60 ? full : `${full.slice(0, 59).trimEnd()}…`;
}

/**
 * True when a public profile is below the indexable bar — see
 * {@link PUBLIC_PROFILE_MIN_ITEMS}. A thin profile renders and is shareable but
 * is served `noindex` and withheld from the sitemap.
 */
export function isThinProfile(publicItemCount: number): boolean {
  return publicItemCount < PUBLIC_PROFILE_MIN_ITEMS;
}

/** The tag fields an item alt is composed from. */
export interface ItemAltParts {
  readonly name: string;
  readonly category: string;
  readonly color: string | null;
}

/**
 * Mandatory, descriptive `alt` for a closet cutout, composed from the item's own
 * tags (name + category + colour) per the SEO image conventions —
 * e.g. `"Wool overcoat — outerwear, camel"`. Falls back to the name alone when no
 * tags are present, and never returns an empty string.
 */
export function itemAlt(item: ItemAltParts): string {
  const tags = [item.category, item.color]
    .map((tag) => tag?.trim())
    .filter((tag): tag is string => !!tag && tag.length > 0);
  const name = item.name.trim().length > 0 ? item.name.trim() : 'A closet piece';
  return tags.length > 0 ? `${name} — ${tags.join(', ')}` : name;
}

/**
 * `alt` for an era or outfit cover — the cover's own title/name, scoped by the
 * owner's name so it reads standalone in image search
 * (e.g. `"Mara Lin — Autumn in Copenhagen"`). Falls back to a plain label when the
 * cover is untitled.
 */
export function coverAlt(ownerName: string, title: string | null, fallback: string): string {
  const label = title?.trim();
  return `${ownerName} — ${label && label.length > 0 ? label : fallback}`;
}
