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
export { EmailButton, type EmailButtonProps } from './EmailButton.tsx';
export { BaseSampleEmail } from './templates/base-sample.tsx';
export { MagicLinkEmail, type MagicLinkEmailProps } from './templates/magic-link.tsx';
export { WelcomeEmail, type WelcomeEmailProps } from './templates/welcome.tsx';
export { WaitlistEmail, type WaitlistEmailProps } from './templates/waitlist.tsx';
export { LaunchInviteEmail, type LaunchInviteEmailProps } from './templates/launch-invite.tsx';
export { DeletionEmail } from './templates/deletion.tsx';
export { EraPlusReceiptEmail, type EraPlusReceiptEmailProps } from './templates/era-plus-receipt.tsx';
export { TheEraEdit, type TheEraEditProps, type WeekWornData } from './templates/the-era-edit.tsx';
export { type EraEditIssue, issue001 } from './issues/issue-001.ts';
