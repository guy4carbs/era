import { config } from '@era/eslint-config';

/**
 * @era/email is the sanctioned email-stack zone (see CLAUDE.md § Email system).
 * Two deliberate departures from the shared config:
 *
 *   1. `no-restricted-syntax` (the raw-`fontFamily` ban) is OFF here. Email
 *      clients strip `@font-face` and CSS vars, so every template sets an inline
 *      `fontFamily` from the `emailFonts` tokens (the Georgia Fraunces stand-in
 *      + a system-sans stack). The design/font guards scan only `apps/*` by
 *      construction; the token-derivation tests are this package's guard instead.
 *   2. React Email's preview server and `email dev` require each template to
 *      have a DEFAULT export, so `no-restricted-exports` is relaxed for
 *      `src/templates/**` only (every template also carries a named export).
 */
export default [
  ...config,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['src/templates/**/*.tsx'],
    rules: {
      'no-restricted-exports': 'off',
    },
  },
];
