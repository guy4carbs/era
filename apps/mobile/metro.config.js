// Metro config for the Era mobile app inside a pnpm monorepo.
// Watches the workspace root so changes in shared packages (e.g. @era/core)
// are picked up, and resolves modules from both the app and the workspace root
// so hoisted/deduped dependencies are found.
//
// The base config comes from Sentry's `getSentryExpoConfig` (a drop-in over
// `getDefaultConfig`) so source maps are wired for symbolication. It's inert
// without a DSN/auth token, so a dormant build behaves identically. The monorepo
// watchFolders/nodeModulesPaths below MUST be re-applied on top — Sentry's wrapper
// doesn't know about the workspace.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getSentryExpoConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
