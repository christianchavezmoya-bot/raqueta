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

// In an npm-workspaces monorepo the root node_modules holds react@18 (web app)
// while the mobile app needs react@19 (react-native 0.81 requirement).
//
// `extraNodeModules` only intercepts top-level project requires — it does NOT
// override requires that originate from inside other node_modules packages (e.g.
// from within react-native or expo itself). `resolveRequest` is called for EVERY
// require regardless of origin, so it's the only hook that can guarantee a single
// react@19 copy across the whole bundle.
const reactModuleDir = path.resolve(projectRoot, 'node_modules/react');
const schedulerModuleDir = path.resolve(projectRoot, 'node_modules/scheduler');

const PINNED_MODULES = {
  // react@19 — required by react-native@0.81. Without this pin, requires that
  // originate inside root node_modules (e.g. ReactFabric-dev.js) resolve to
  // root react@18, which lacks ReactSharedInternals.S → crash on startup.
  'react': reactModuleDir,
  'react/jsx-runtime': path.resolve(reactModuleDir, 'jsx-runtime'),
  'react/jsx-dev-runtime': path.resolve(reactModuleDir, 'jsx-dev-runtime'),
  // scheduler@0.26 must match react@19. Root has scheduler@0.23 (react@18).
  'scheduler': schedulerModuleDir,
  'scheduler/tracing': path.resolve(schedulerModuleDir, 'tracing'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (Object.prototype.hasOwnProperty.call(PINNED_MODULES, moduleName)) {
    // Re-enter default resolution but anchored in the pinned directory so Metro
    // picks up the correct package.json / main field for us.
    return context.resolveRequest(
      { ...context, originModulePath: path.resolve(PINNED_MODULES[moduleName], '_anchor') },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
