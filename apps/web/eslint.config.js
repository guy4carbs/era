import { config } from '@era/eslint-config';

/**
 * Web ESLint config = shared monorepo rules + one narrow exemption.
 *
 * Next.js REQUIRES a default export from route-segment files (page, layout,
 * loading, error, not-found), from the metadata routes (sitemap, robots), and
 * from next.config.ts. Our shared `no-restricted-exports` rule bans default
 * exports across .ts/.tsx; we turn it off ONLY for those framework-mandated
 * files. Every other file in apps/web stays under the no-default-export
 * convention.
 */
export default [
  {
    ignores: ['.next/**', 'next-env.d.ts'],
  },
  ...config,
  {
    files: [
      'src/app/**/{page,layout,loading,error,not-found}.tsx',
      'src/app/**/{sitemap,robots}.ts',
      'next.config.ts',
    ],
    rules: {
      'no-restricted-exports': 'off',
    },
  },
];
