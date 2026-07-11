/**
 * Settings-surface copy. @era/core/strings has no `settings` home yet, so the
 * labels live here as clearly-named constants until Quill folds them into the
 * shared deck. Voice matches the deck: warm, plain, honest — the delete copy is
 * the one place allowed to state the hard truth (irreversible) plainly.
 *
 * NOTE for Quill: promote SETTINGS_COPY into `strings.settings` when the deck
 * grows a settings surface; keep the wording, drop this file.
 */

/**
 * Support inbox. Placeholder address, kept as a single constant so a real one is
 * a one-line change. Matches the address already cited in the legal markdown.
 */
export const SUPPORT_EMAIL = 'support@era.style';

/** Pre-filled subject for the support mailto, URL-encoded. */
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=Era%20Support`;

export const SETTINGS_COPY = {
  /** Screen title + document <title> stem. */
  title: 'Settings',
  /** Back affordance label (returns to the closet). */
  back: 'Closet',

  // --- appearance ---
  appearance: 'Appearance',
  themeLabel: 'Theme',
  themeSystem: 'System',
  themeLight: 'Light',
  themeDark: 'Dark',

  // --- privacy ---
  privacy: 'Privacy',
  privateClosetTitle: 'Private closet',
  privateClosetHint: 'Only you can see your items and outfits.',

  // --- shared error idiom (reused by any settings action that can fail) ---
  /** The settings-wide "action failed, try again" line — matches {@link SETTINGS_COPY.deleteError}. */
  genericError: 'Something went wrong — please try again.',
  /** Quiet retry affordance for a failed settings read. */
  retry: 'Try again',

  // --- support & legal ---
  support: 'Support',
  contactSupport: 'Contact support',
  contactSupportHint: 'Questions or feedback? We read every message.',
  legal: 'Legal',
  privacyPolicy: 'Privacy Policy',
  terms: 'Terms of Service',

  // --- account ---
  account: 'Account',
  signedInAs: (email: string): string => `Signed in as ${email}`,
  /** Quiet entry into the owner's own public profile page (`/{username}`). */
  viewProfile: 'View your public profile',
  signOut: 'Sign out',

  // --- delete account (destructive) ---
  deleteAccount: 'Delete account',
  /** The confirm button inside the dialog. */
  deleteConfirmCta: 'Delete my account',
  deleteTitle: 'Delete your account?',
  /** The irreversibility statement — required to be plain and unsoftened. */
  deleteBody:
    "This permanently deletes your account, closet, and all images. This can't be undone.",
  /** Prompt above the typed-confirmation field. */
  deletePrompt: (email: string): string => `Type ${email} to confirm.`,
  deleteInputLabel: 'Confirm your email',
  /** Inline error when the typed email doesn't match (400 confirmation_mismatch). */
  deleteMismatch: "That doesn't match your account email.",
  /** Inline error when the server fails the deletion (500) — we do NOT sign out. */
  deleteError: 'Something went wrong — please try again.',
  /** Brief state shown after a successful deletion, before the redirect home. */
  deleted: 'Your account was deleted.',
  cancel: 'Cancel',
} as const;
