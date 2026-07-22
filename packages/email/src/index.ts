/**
 * @era/email — Era's React Email rendering layer.
 *
 * Templates extend `BaseEmail`, draw every value from the `@era/tokens`-derived
 * email tokens, and render through `renderEmail` into the `{ html, text }` the
 * `apps/web` Resend transport sends. See CLAUDE.md § Email system.
 */
export {
  emailColors,
  emailColorsDark,
  emailFonts,
  emailType,
  emailLayout,
} from './tokens.ts';
export { BaseEmail, type BaseEmailProps } from './BaseEmail.tsx';
export { renderEmail, type RenderedEmail } from './render.ts';
export { BaseSampleEmail } from './templates/base-sample.tsx';
