/**
 * Deterministic two-line split of the locked landing hero title.
 *
 * The hero renders the promise as two rising lines, but the SOURCE stays the one
 * locked string in `strings.site.hero.title` — we never author the lines as
 * separate copy. This helper splits that single title at the word boundary
 * nearest its midpoint, so `lines.join(' ')` reconstructs the original exactly
 * (asserted in hero-title.test.ts). Author-time and pure — no DOM measurement,
 * so the server-rendered h1 has no hydration flash and no layout shift.
 */

/** Split a title into two balanced lines at the word gap nearest the midpoint. */
export function splitHeroTitle(title: string): [string, string] {
  const words = title.trim().split(/\s+/);
  if (words.length < 2) {
    return [title, ''];
  }
  const mid = title.length / 2;
  // Walk the word boundaries and keep the break whose left-line length lands
  // closest to the midpoint — a stable, content-independent balance point.
  let bestIndex = 1;
  let bestDistance = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const leftLength = words.slice(0, i).join(' ').length;
    const distance = Math.abs(leftLength - mid);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return [words.slice(0, bestIndex).join(' '), words.slice(bestIndex).join(' ')];
}
