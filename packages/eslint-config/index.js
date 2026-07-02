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
    },
  },
  prettier,
);

export default config;
