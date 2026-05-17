import { getDefaultConfig } from "expo/metro-config.js";
import { withNativeWind } from "nativewind/dist/metro/index.js";
import { existsSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(projectRoot, "../..");
const config = getDefaultConfig(projectRoot);
const defaultResolveRequest = config.resolver.resolveRequest;

config.watchFolders = Array.from(new Set([...(config.watchFolders ?? []), workspaceRoot]));

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fromSharedSource = context.originModulePath.includes(`${sep}packages${sep}shared${sep}src${sep}`);
  if (fromSharedSource && moduleName.endsWith(".js")) {
    const tsPath = resolve(dirname(context.originModulePath), moduleName.replace(/\.js$/, ".ts"));
    if (existsSync(tsPath)) return { type: "sourceFile", filePath: tsPath };
  }

  if (defaultResolveRequest) return defaultResolveRequest(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

export default withNativeWind(config, { input: "./global.css" });
