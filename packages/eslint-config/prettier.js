/**
 * Shared Prettier config for the Era monorepo.
 *
 * Prettier config files are consumed by a tool that requires a default export,
 * so this file is exempt from the no-default-export convention.
 */
const config = {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
};

export default config;
