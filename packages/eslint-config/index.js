import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Shared ESLint 9 flat config for the Era monorepo.
 *
 * Consumers import the named `config` array and re-export it:
 *   import { config } from '@era/eslint-config';
 *   export default config;
 */
export const config = tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The no-default-export convention applies to library source only. Tool
    // config files (eslint.config.js, prettier.js) require default exports and
    // are intentionally exempt because this block is scoped to TS sources.
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-restricted-exports': [
        'error',
        {
          restrictDefaultExports: {
            direct: true,
            named: true,
            defaultFrom: true,
            namedFrom: true,
            namespaceFrom: true,
          },
        },
      ],
      // Typography gate: raw `fontFamily` is banned in app/component source. The
      // Fraunces/Geist faces are reached ONLY through the `<Text variant>` type
      // system (@era/tokens typeRoles). A genuine exception (the Text primitive
      // itself, a bare TextInput mirroring a role, a documented monospace field)
      // must carry an `eslint-disable-next-line no-restricted-syntax` with a
      // reason — so every raw font declaration is deliberate and auditable.
      'no-restricted-syntax': [
        'error',
        {
          selector: "Property[key.name='fontFamily']",
          message:
            'Raw fontFamily is banned — render text through <Text variant> (the Fraunces/Geist type system in @era/tokens). If this is the Text primitive, a TextInput, or a documented mono exception, add an eslint-disable-next-line no-restricted-syntax with a reason.',
        },
      ],
    },
  },
  prettier,
);

export default config;
