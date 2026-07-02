import { config } from '@era/eslint-config';

/**
 * ESLint flat config for the Era mobile app.
 *
 * Extends the shared monorepo config, then relaxes the no-default-export rule
 * for expo-router route files: expo-router discovers screens and layouts by the
 * DEFAULT export of every file under `app/`, so those files must export default.
 * Build artefacts and native project folders are ignored.
 */
export default [
  {
    ignores: [
      '.expo/**',
      'ios/**',
      'android/**',
      'dist/**',
      'expo-env.d.ts',
      // CommonJS build config — Node globals, not part of the app source graph.
      'babel.config.js',
      'metro.config.js',
    ],
  },
  ...config,
  {
    files: ['app/**/*.tsx'],
    rules: {
      'no-restricted-exports': 'off',
    },
  },
];
