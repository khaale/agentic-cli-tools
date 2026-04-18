import {
  getEffectiveConfigView,
  initGlobalConfig,
  resolveConfigPath
} from "../lib/config.js";

export async function configInit(options) {
  return {
    kind: "get",
    data: await initGlobalConfig(options)
  };
}

export async function configGet(options) {
  return {
    kind: "get",
    data: await getEffectiveConfigView(options)
  };
}

export async function configPath(options) {
  return {
    kind: "raw",
    data: resolveConfigPath(options)
  };
}
