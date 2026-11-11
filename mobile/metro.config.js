// Lets the app import `@travel-life/shared` straight from ../packages/shared
// without publishing or building it.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../packages/shared');

const config = getDefaultConfig(projectRoot);

// Watch the shared sources so edits there hot-reload.
config.watchFolders = [sharedRoot];

// The shared package's own dependencies (zod, date-fns, date-fns-tz) must
// resolve to THIS app's copies: one instance of each in the bundle, and no
// need to `npm install` inside packages/shared to run the app.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.blockList = [
  new RegExp(`${path.resolve(sharedRoot, 'node_modules').replace(/[\\/]/g, '[\\\\/]')}[\\\\/].*`),
];

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@travel-life/shared') {
    return { type: 'sourceFile', filePath: path.join(sharedRoot, 'src', 'index.ts') };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
