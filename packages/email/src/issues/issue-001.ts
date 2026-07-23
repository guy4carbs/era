/**
 * The Era Edit — issue content contract + Issue No. 001.
 *
 * Per-issue editorial content is DATA, not strings: the fixed format (masthead,
 * section labels, stat sentence shapes) lives in `@era/core`'s
 * `strings.emails.theEraEdit`; each issue ships as one of these modules. The
 * template consumes the type, so a future issue is a new file and nothing else.
 *
 * Voice rules (the brand register): calm, honest, invitational, zero
 * exclamation marks, no fake urgency. The period device — naming an era and
 * closing it with the wordmark's full stop — is used ONCE per issue,
 * deliberately.
 */

/** One issue of The Era Edit, fully described. */
export interface EraEditIssue {
  /** Print-style issue number (1 → "No. 001" via strings). */
  readonly number: number;
  /** The issue date line as it should read, e.g. "July 26, 2026". */
  readonly date: string;
  /** The lead editorial's hero image — always with a full-sentence alt. */
  readonly hero: {
    /** Absolute production URL (email clients need hosted images). */
    readonly src: string;
    /** A complete sentence — the image's meaning when images are off. */
    readonly alt: string;
  };
  /** The lead editorial — serif headline + 2–3 short paragraphs. */
  readonly lead: {
    readonly headline: string;
    readonly paragraphs: readonly string[];
  };
  /** The Formula — 3–5 lines, set as an elegant hairline-ruled list. */
  readonly formula: {
    readonly lines: readonly string[];
  };
  /** The Dispatch — ONE line of product news. The type enforces exactly one. */
  readonly dispatch: string;
}

/**
 * ISSUE No. 001 — the shipping example. The era of the week is the July
 * stretch when repetition becomes the point; the period device lands once, at
 * the close of the lead.
 */
export const issue001: EraEditIssue = {
  number: 1,
  date: 'July 26, 2026',
  hero: {
    src: 'https://era.style/brand/email/era-edit/issue-001-hero@2x.png',
    alt: 'A summer capsule laid out on cream linen — a loose linen shirt, taupe wide-leg trousers, worn leather sandals, and one rust silk scarf.',
  },
  lead: {
    headline: 'The linen weeks.',
    paragraphs: [
      'There is a stretch of July when the heat stops being an event and becomes the weather. Getting dressed changes with it — fewer layers, fewer decisions, and more repetition of the few pieces that actually breathe.',
      "This is the week to stop fighting that. Pick the shirt you reach for anyway and let it lead; let everything else fall in behind it. Repetition isn't a rut. Worn often enough, on purpose, it becomes a signature.",
      'Call it what it is: your summer era.',
    ],
  },
  formula: {
    lines: [
      'One linen shirt, worn loose.',
      'One pair of wide trousers in a quiet neutral.',
      'Sandals you have already broken in.',
      'One accent — a scarf, a chain — never two.',
    ],
  },
  dispatch:
    'From the studio: Ovi now says why a piece completes your closet — and when it doesn’t — right on the card, in early access.',
};
