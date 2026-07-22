import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { palette } from '@era/tokens';

/**
 * buildOgImage — the shared 1200×630 OpenGraph card for Era's marketing surfaces.
 *
 * A quiet cream field (the brand light bg) carrying a Fraunces headline and the
 * locked 'era.' mark lockup bottom-left, built with `next/og` (built in — no new
 * dependency). Every per-page `opengraph-image.tsx` route calls this with its own
 * headline, so the card is generated per page through the SEO stack rather than a
 * single static PNG.
 *
 * Colours come from `@era/tokens` (`palette.light.*` / `palette.ink`), not literal
 * hex, so this file stays clear of the design-consistency guard — Satori renders
 * server-side and can't read CSS vars, so the tokens are read as values here the
 * same way the journal/styles OG routes read `palette.dark.*`.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = 'image/png' as const;

// The card's palette, from the light (cream) side of the token set.
const FIELD = palette.light.bg; // warm cream
const INK = palette.ink; // warm near-black headline + mark
const MUTED = palette.light.secondaryStrong; // the small footer label

/**
 * The Fraunces face for the headline, read once at module load from the static
 * TTF copied into `src/assets/fonts` (hermetic — no edge fetch). This is the same
 * cut the mobile app bundles; the web DOM loads Fraunces via next/font, but Satori
 * needs the raw font bytes, so we read the file here.
 */
const frauncesData = readFileSync(
  join(process.cwd(), 'src/assets/fonts/Fraunces-LargeTitle.ttf'),
);

/**
 * The 'era.' mark as a standalone SVG data URI — the SAME vector paths as
 * `public/brand/era-mark.svg`, filled with `palette.ink`, so the lockup on the
 * card is byte-identical to the mark everywhere else. Embedding the real mark (not
 * re-typesetting 'era' in Fraunces) is what keeps it identical-everywhere.
 */
const MARK_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="32.0 -901.0 2914.7 921.0">` +
  `<g transform="scale(1 -1)" fill="${INK}">` +
  `<path transform="translate(0.0 0)" d="M849 515Q849 506 843 500.5Q837 495 825 495L205 495L205 513L581 513Q599 513 599 532Q599 713 552.5 798Q506 883 442 883Q388 883 349 845.5Q310 808 287.5 730Q265 652 265 530Q265 323 351 221Q437 119 577 119Q682 119 752.5 176.5Q823 234 832 331Q832 335 833.5 336.5Q835 338 836 338Q839 338 841.5 336.5Q844 335 843 329Q838 229 786 150Q734 71 647.5 25.5Q561 -20 455 -20Q330 -20 234.5 35Q139 90 85.5 190Q32 290 32 423Q32 566 86.5 673Q141 780 239.5 840.5Q338 901 472 901Q587 901 671 850.5Q755 800 802 713Q849 626 849 515Z"/>` +
  `<path transform="translate(882.2 0)" d="M362 503Q362 634 400 722Q438 810 498 855Q558 900 622 900Q697 900 737.5 852.5Q778 805 778 717Q778 639 741.5 601Q705 563 651 563Q599 563 574.5 591.5Q550 620 548 675L546 707Q546 737 534.5 752.5Q523 768 495 768Q463 768 436 738.5Q409 709 391.5 648.5Q374 588 374 497ZM374 879L374 550L374 63Q374 51 381 42Q388 33 399 30L498 14Q504 13 505.5 11Q507 9 507 7Q507 4 504.5 2Q502 0 497 0L44 0Q40 0 37 2.5Q34 5 34 7Q34 10 37.5 12Q41 14 47 15L99 24Q112 27 117.5 34Q123 41 123 52L123 788Q123 795 120 799.5Q117 804 110 803L44 804Q41 803 38.5 805.5Q36 808 36 810Q36 813 38.5 815.5Q41 818 47 819L342 889Q350 891 354.5 891.5Q359 892 363 892Q369 892 371.5 888Q374 884 374 879Z"/>` +
  `<path transform="translate(1673.1 0)" d="M558 93L558 102L545 92L545 744Q545 812 516.5 849Q488 886 435 886Q375 886 345.5 855.5Q316 825 316 786L316 702Q316 651 279 615Q242 579 185 579Q144 579 117.5 604Q91 629 91 678Q91 730 133.5 781.5Q176 833 259.5 866.5Q343 900 466 900Q633 900 715 830.5Q797 761 797 635L797 118Q797 84 809.5 68.5Q822 53 840 53Q857 53 871.5 64.5Q886 76 889 102Q889 106 891 107Q893 108 895 108Q897 108 898 107Q899 106 899 102Q899 83 881.5 54.5Q864 26 823.5 4Q783 -18 714 -18Q632 -18 595 13.5Q558 45 558 93ZM40 195Q40 304 131.5 371Q223 438 422 438Q482 438 520 426.5Q558 415 591 396L582 389Q549 405 515.5 414Q482 423 439 423Q368 423 329 373Q290 323 290 231Q290 143 327.5 97.5Q365 52 426 52Q465 52 504 72Q543 92 569 127L580 120Q537 53 460.5 17.5Q384 -18 295 -18Q182 -18 111 41.5Q40 101 40 195Z"/>` +
  `<path transform="translate(2591.7 0)" d="M204 -18Q163 -18 130 3Q97 24 77.5 59.5Q58 95 58 138Q58 179 77.5 214.5Q97 250 130 271Q163 292 204 292Q248 292 281.5 271Q315 250 335 214.5Q355 179 355 138Q355 95 335 59.5Q315 24 281.5 3Q248 -18 204 -18Z"/>` +
  `</g></svg>`;

const MARK_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(MARK_SVG).toString('base64')}`;

// The mark's intrinsic aspect ratio, from its viewBox (width / height).
const MARK_ASPECT = 2914.7 / 921.0;
const MARK_HEIGHT = 56; // px on the card — a confident but quiet lockup

export interface BuildOgImageOptions {
  /** The headline set in Fraunces — the page's title or north star. */
  headline: string;
  /** Optional tracked eyebrow above the headline (e.g. a section label). */
  eyebrow?: string;
}

/**
 * Render the shared cream card with `headline` (and an optional `eyebrow`). Every
 * marketing `opengraph-image.tsx` returns `buildOgImage({ headline })`.
 */
export function buildOgImage({ headline, eyebrow }: BuildOgImageOptions): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '80px',
          background: FIELD,
          color: INK,
          // eslint-disable-next-line no-restricted-syntax -- Satori/ImageResponse font name, not DOM text: the <Text> type system doesn't apply to next/og rendering; the face is loaded via the `fonts` option below
          fontFamily: 'Fraunces',
        }}
      >
        {eyebrow ? (
          <div
            style={{
              display: 'flex',
              fontSize: 26,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: MUTED,
            }}
          >
            {eyebrow}
          </div>
        ) : (
          // Keep the space-between rhythm with a zero-height spacer when no eyebrow.
          <div style={{ display: 'flex' }} />
        )}

        <div
          style={{
            display: 'flex',
            fontSize: 76,
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            maxWidth: '960px',
          }}
        >
          {headline}
        </div>

        {/* The locked 'era.' mark, bottom-left — the real vector data URI, not
            re-typeset. Satori renders a plain <img>; next/image has no meaning in
            an ImageResponse. */}
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <img
            src={MARK_DATA_URI}
            alt="era"
            width={Math.round(MARK_HEIGHT * MARK_ASPECT)}
            height={MARK_HEIGHT}
          />
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [{ name: 'Fraunces', data: frauncesData, style: 'normal', weight: 600 }],
    },
  );
}
