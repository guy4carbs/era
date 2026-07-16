/**
 * Era web — turnaround page-order composition. PURE, no React, no DOM.
 *
 * The web {@link AngleViewer} reads as a rotation: the straight-on cutout first,
 * then the accepted turnaround renders in the frozen {@link TURNAROUND_ANGLES}
 * order (three-quarter → side → back). Only accepted renders arrive from the
 * server and some angles may be missing, so this composes the ordered page list
 * the pager swipes through — front always present, each angle appended only when
 * a render for it exists. Extracted here (not inlined in the component) so the
 * ordering is node-testable without a browser. Never throws.
 *
 * A deliberate mirror of `apps/mobile/lib/turnaround-pages.ts` — the shape is
 * shared in spirit but NOT imported across apps (core is the only shared home);
 * if it should live in `@era/core`, that's an Atlas call, not a cross-app import.
 */
import { TURNAROUND_ANGLES, type TurnaroundAngle, type TurnaroundRender } from '@era/core/turnaround';

/**
 * One page in the viewer: the `'front'` cutout, or one of the three turnaround
 * angles. `key` is a stable React key (the angle slug, or `'front'`); `displayUrl`
 * is what the page shows.
 */
export interface AngleViewerPage {
  readonly key: 'front' | TurnaroundAngle;
  readonly angle: 'front' | TurnaroundAngle;
  readonly displayUrl: string;
}

/**
 * Compose the ordered viewer pages from the front cutout URL and the accepted
 * renders. Front leads; the angles follow in {@link TURNAROUND_ANGLES} order,
 * skipping any angle with no render (or a render missing its `displayUrl`). A
 * duplicate angle keeps the first render. Pass an empty `renders` and you get a
 * single front page. Never throws.
 */
export function composeAnglePages(
  frontUrl: string,
  renders: readonly TurnaroundRender[],
): readonly AngleViewerPage[] {
  const pages: AngleViewerPage[] = [{ key: 'front', angle: 'front', displayUrl: frontUrl }];
  for (const angle of TURNAROUND_ANGLES) {
    const render = renders.find((candidate) => candidate.angle === angle);
    if (render && render.displayUrl) {
      pages.push({ key: angle, angle, displayUrl: render.displayUrl });
    }
  }
  return pages;
}
