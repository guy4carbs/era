import { type CSSProperties } from 'react';

/**
 * EraMark — the locked 'era.' brand mark, rendered as inline SVG.
 *
 * The mark is the word 'era.' cut from Fraunces (opsz 144, wght 620, WONK 0,
 * SOFT 0) as real vector paths — NOT live text. The path data below is copied
 * verbatim from the single source of truth,
 * `apps/web/public/brand/era-mark.svg` (ink paths, viewBox = the ink bounds; its
 * cream sibling `era-mark-cream.svg` shares identical geometry, only the fill
 * differs). Inlining the paths keeps the mark fetchless and pixel-crisp at any
 * size; when the cut ever changes, re-cut the SVG and re-copy these paths.
 *
 * The mark is a TWO-INK brand: flat warm ink (#1C1B19) or cream (#FAF7F0), and
 * NOTHING else — never recolored, stretched, glowed, or shadowed. On web the two
 * inks come through the palette-backed CSS vars (`--color-ink` is the constant
 * warm ink; `--color-cream` is the constant brand cream = `palette.light.bg`),
 * so the fills stay token-routed and clear of the design-consistency hex guard.
 * Dark-mode UI uses the `cream` variant (an ink-vs-cream choice), NOT a recolor
 * of the ink mark.
 */

/** The mark's two inks. `ink` = warm near-black on cream; `cream` = the inverse. */
export type EraMarkVariant = 'ink' | 'cream';

export interface EraMarkProps {
  /** Which ink the glyphs render in. Defaults to `ink`. Ignored when `fill` is set. */
  variant?: EraMarkVariant;
  /**
   * An explicit, sanctioned palette-backed fill var to override the `variant`
   * ink — the one supported escape hatch, for server-rendered placements that
   * must pick the ink PER MODE without reading the client theme. The only
   * approved value is `'var(--color-mark-onbg)'` (ink on the light bg, cream on
   * the dark bg — the two-ink brand's mode choice, defined in theme-css). Never
   * pass a raw hex or an off-brand var.
   */
  fill?: string;
  /**
   * Rendered height. A raw pixel number, or a CSS length token string
   * (e.g. `'var(--rail-orb)'`) for contexts that size the mark off an existing
   * var. Width follows the mark's aspect ratio automatically. Minimum sanctioned
   * inline height is 16px (see the Brand mark rules in the root CLAUDE.md).
   */
  heightPx?: number | string;
  style?: CSSProperties;
  className?: string;
}

// The mark's intrinsic geometry, copied from public/brand/era-mark.svg. The
// viewBox is the tight ink bounds; the aspect ratio (width / height) sizes the
// element so a caller sets only a height.
const VIEW_BOX = '32.0 -901.0 2914.7 921.0';
const ASPECT = 2914.7 / 921.0;

// The four glyph paths — 'e', 'r', 'a', and the period — exactly as cut in
// era-mark.svg. Rendered inside the same `scale(1 -1)` flip the source uses (the
// font's y-up coordinates), and filled via `currentColor` so the variant vars
// drive the ink. Do not hand-edit: re-copy from the source SVG if the cut moves.
const PATHS = [
  'M849 515Q849 506 843 500.5Q837 495 825 495L205 495L205 513L581 513Q599 513 599 532Q599 713 552.5 798Q506 883 442 883Q388 883 349 845.5Q310 808 287.5 730Q265 652 265 530Q265 323 351 221Q437 119 577 119Q682 119 752.5 176.5Q823 234 832 331Q832 335 833.5 336.5Q835 338 836 338Q839 338 841.5 336.5Q844 335 843 329Q838 229 786 150Q734 71 647.5 25.5Q561 -20 455 -20Q330 -20 234.5 35Q139 90 85.5 190Q32 290 32 423Q32 566 86.5 673Q141 780 239.5 840.5Q338 901 472 901Q587 901 671 850.5Q755 800 802 713Q849 626 849 515Z',
  'M362 503Q362 634 400 722Q438 810 498 855Q558 900 622 900Q697 900 737.5 852.5Q778 805 778 717Q778 639 741.5 601Q705 563 651 563Q599 563 574.5 591.5Q550 620 548 675L546 707Q546 737 534.5 752.5Q523 768 495 768Q463 768 436 738.5Q409 709 391.5 648.5Q374 588 374 497ZM374 879L374 550L374 63Q374 51 381 42Q388 33 399 30L498 14Q504 13 505.5 11Q507 9 507 7Q507 4 504.5 2Q502 0 497 0L44 0Q40 0 37 2.5Q34 5 34 7Q34 10 37.5 12Q41 14 47 15L99 24Q112 27 117.5 34Q123 41 123 52L123 788Q123 795 120 799.5Q117 804 110 803L44 804Q41 803 38.5 805.5Q36 808 36 810Q36 813 38.5 815.5Q41 818 47 819L342 889Q350 891 354.5 891.5Q359 892 363 892Q369 892 371.5 888Q374 884 374 879Z',
  'M558 93L558 102L545 92L545 744Q545 812 516.5 849Q488 886 435 886Q375 886 345.5 855.5Q316 825 316 786L316 702Q316 651 279 615Q242 579 185 579Q144 579 117.5 604Q91 629 91 678Q91 730 133.5 781.5Q176 833 259.5 866.5Q343 900 466 900Q633 900 715 830.5Q797 761 797 635L797 118Q797 84 809.5 68.5Q822 53 840 53Q857 53 871.5 64.5Q886 76 889 102Q889 106 891 107Q893 108 895 108Q897 108 898 107Q899 106 899 102Q899 83 881.5 54.5Q864 26 823.5 4Q783 -18 714 -18Q632 -18 595 13.5Q558 45 558 93ZM40 195Q40 304 131.5 371Q223 438 422 438Q482 438 520 426.5Q558 415 591 396L582 389Q549 405 515.5 414Q482 423 439 423Q368 423 329 373Q290 323 290 231Q290 143 327.5 97.5Q365 52 426 52Q465 52 504 72Q543 92 569 127L580 120Q537 53 460.5 17.5Q384 -18 295 -18Q182 -18 111 41.5Q40 101 40 195Z',
  'M204 -18Q163 -18 130 3Q97 24 77.5 59.5Q58 95 58 138Q58 179 77.5 214.5Q97 250 130 271Q163 292 204 292Q248 292 281.5 271Q315 250 335 214.5Q355 179 355 138Q355 95 335 59.5Q315 24 281.5 3Q248 -18 204 -18Z',
] as const;

// The translate offsets each glyph carries in the source SVG, kept in lockstep
// with era-mark.svg so the lockup spacing matches the cut exactly.
const OFFSETS = ['0.0', '882.2', '1673.1', '2591.7'] as const;

/** Variant → the sanctioned palette-backed fill var (never a raw hex). */
const FILL_VAR: Record<EraMarkVariant, string> = {
  ink: 'var(--color-ink)',
  cream: 'var(--color-cream)',
};

/**
 * The 'era.' mark as inline SVG. Height-driven (width follows the aspect ratio);
 * `variant` picks the ink. Decorative-by-default but self-labeled: it carries
 * `role="img"` + `aria-label="era"` so it is announced as the wordmark, not a
 * loose glyph run.
 */
export function EraMark({ variant = 'ink', fill, heightPx = 24, style, className }: EraMarkProps) {
  const height = typeof heightPx === 'number' ? `${heightPx}px` : heightPx;
  const inkColor = fill ?? FILL_VAR[variant];

  return (
    <svg
      className={className}
      role="img"
      aria-label="era"
      viewBox={VIEW_BOX}
      style={{
        height,
        width: `calc(${height} * ${ASPECT})`,
        display: 'inline-block',
        color: inkColor,
        ...style,
      }}
    >
      <g transform="scale(1 -1)" fill="currentColor">
        {PATHS.map((d, index) => (
          <path key={OFFSETS[index]} transform={`translate(${OFFSETS[index]} 0)`} d={d} />
        ))}
      </g>
    </svg>
  );
}
