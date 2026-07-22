/**
 * Email-safe design tokens — DERIVED from `@era/tokens`, never re-typed.
 *
 * Email clients strip CSS custom properties and `@font-face`, so the app's
 * `var(--…)` token pipeline and the Fraunces/Geist web fonts can't reach an
 * inbox. This module is the one sanctioned place that resolves the palette to
 * literal hex and picks web-safe font stacks — but every value still traces back
 * to `@era/tokens` (asserted 1:1 by `tokens.test.ts`) so the email surface and
 * the app never drift. If a hex here is ever typed by hand, that test fails.
 *
 * See CLAUDE.md § Email system for why this package sits outside the design and
 * font guards (which scan only `apps/*`).
 */
import { palette, spacing, typeRamp } from '@era/tokens';

/**
 * The light-mode email palette — the default a client renders. Each field is a
 * reference into `@era/tokens`, resolved to a literal hex so it survives an
 * inbox that has no CSS variables.
 */
export const emailColors = {
  /** Page + container background — warm cream. */
  canvas: palette.light.bg,
  /** Reading text — warm near-black ink. */
  text: palette.light.text,
  /** Hairline dividers between header / content / footer. */
  hairline: palette.light.hairline,
  /** The muted-rust cautionary tone (mode-independent semantic). */
  caution: palette.semantic.rust,
  /** Small-text-safe secondary — the footer / caption color. */
  secondary: palette.light.secondaryStrong,
} as const;

/**
 * The dark-mode email palette, for the `@media (prefers-color-scheme: dark)`
 * block in `BaseEmail`'s `<Head>`. Same fields as {@link emailColors}, drawn
 * from `palette.dark.*` — clients that honor the scheme swap to these.
 */
export const emailColorsDark = {
  canvas: palette.dark.bg,
  text: palette.dark.text,
  hairline: palette.dark.hairline,
  secondary: palette.dark.secondaryStrong,
} as const;

/**
 * The two email font stacks. Both are web-safe: no template loads a webfont.
 *
 * `headline` is the sanctioned Fraunces stand-in — the same Georgia stack the
 * legacy `apps/web/src/lib/send-waitlist-email.ts` uses — so editorial headings
 * keep a serif voice in clients that strip `@font-face`. `body` is the system
 * sans stack for all reading text.
 */
export const emailFonts = {
  headline: "Georgia, 'Times New Roman', serif",
  body: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
} as const;

/**
 * The email type scale. Sizes are pulled from `@era/tokens` `typeRamp` where an
 * exact step exists (largeTitle 34, title2 22, body 17, caption 12) so the ramp
 * stays the single source of the numbers; `letterSpacing` and `leading` are the
 * email-tuned values this package owns (Georgia reads looser than Fraunces, so
 * the headline tracking is drawn in a touch — tuned against the react-email
 * preview, see the design-lab email island).
 */
export const emailType = {
  h1: { sizePx: typeRamp.largeTitle.px, letterSpacing: '-0.01em', leading: 1.15 },
  h2: { sizePx: typeRamp.title2.px, letterSpacing: '-0.01em', leading: 1.25 },
  body: { sizePx: typeRamp.body.px, leading: 1.5 },
  caption: { sizePx: typeRamp.caption.px, leading: 1.33 },
} as const;

/**
 * Layout constants for the email shell. `maxWidthPx` is the classic 600px email
 * body; `padPx` is `spacing.s12` (48) so the container's air matches the app's
 * scale; `markWidthPx` is the wordmark's display width (the source PNG is 2×).
 * `markSrc` is the HOSTED asset — email can't inline a local file, so it points
 * at the public web origin.
 */
export const emailLayout = {
  maxWidthPx: 600,
  padPx: spacing.s12,
  markWidthPx: 140,
  markSrc: 'https://era.style/brand/email/era-mark-email@2x.png',
} as const;
