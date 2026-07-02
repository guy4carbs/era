// Metro config for the Era mobile app inside a pnpm monorepo.
// Watches the workspace root so changes in shared packages (e.g. @era/core)
// are picked up, and resolves modules from both the app and the workspace root
// so hoisted/deduped dependencies are found.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
