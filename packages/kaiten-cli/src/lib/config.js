import {
  configExists,
  normalizeStringValue,
  normalizeUrlValue,
  readStoredConfig as readSharedStoredConfig,
  resolveConfigPath as resolveToolConfigPath,
  resolveConfigSource as resolveSharedConfigSource,
  resolveConfigValue as resolveSharedConfigValue,
  resolveDefaultCacheDir as resolveToolDefaultCacheDir,
  resolveRuntime,
  writeStoredConfig as writeSharedStoredConfig
} from "@khaale/cli-core";
import { fail } from "./errors.js";

const CONFIG_EXIT_CODE = 3;
const CONFIG_KEYS = [
  "KAITEN_URL",
  "KAITEN_API_TOKEN",
  "KAITEN_API_BASE",
  "KAITEN_BROKEN_API",
  "KAITEN_CACHE_DIR"
];
const TOOL_NAME = "ktc";

export async function loadConfig(options = {}) {
  const snapshot = await getEffectiveConfigSnapshot(options);

  if (!snapshot.values.KAITEN_URL) {
    fail("missing required configuration: KAITEN_URL", CONFIG_EXIT_CODE);
  }

  if (!snapshot.values.KAITEN_API_TOKEN) {
    fail("missing required configuration: KAITEN_API_TOKEN", CONFIG_EXIT_CODE);
  }

  const parsed = parseHostAndApiBase(
    snapshot.values.KAITEN_URL,
    snapshot.values.KAITEN_API_BASE
  );

  return {
    host: parsed.host,
    apiBase: parsed.apiBase,
    token: snapshot.values.KAITEN_API_TOKEN,
    brokenApi: snapshot.values.KAITEN_BROKEN_API ?? false,
    cacheDir: snapshot.values.KAITEN_CACHE_DIR
  };
}

export async function getEffectiveConfigView(options = {}) {
  const snapshot = await getEffectiveConfigSnapshot(options);
  return {
    path: snapshot.path,
    configured: Object.entries(snapshot.sources)
      .filter(([, source]) => source && source !== "default")
      .map(([key]) => key)
  };
}

export async function getEffectiveConfigSnapshot(options = {}) {
  const runtime = resolveRuntime(TOOL_NAME, options);
  const fileConfig = await readSharedStoredConfig(runtime, {
    keys: CONFIG_KEYS,
    normalizers: {
      KAITEN_URL: normalizeKaitenUrl,
      KAITEN_API_TOKEN: normalizeToken,
      KAITEN_API_BASE: normalizeApiBaseValue,
      KAITEN_BROKEN_API: normalizeBooleanValue,
      KAITEN_CACHE_DIR: normalizeCacheDir
    },
    exitCode: CONFIG_EXIT_CODE
  });
  const values = {};
  const sources = {};

  values.KAITEN_URL = resolveSharedConfigValue({
    key: "KAITEN_URL",
    env: runtime.env,
    storedConfig: fileConfig,
    normalizer: normalizeKaitenUrl
  });
  sources.KAITEN_URL = resolveSharedConfigSource({
    key: "KAITEN_URL",
    env: runtime.env,
    storedConfig: fileConfig
  });

  values.KAITEN_API_TOKEN = resolveSharedConfigValue({
    key: "KAITEN_API_TOKEN",
    env: runtime.env,
    storedConfig: fileConfig,
    normalizer: normalizeToken
  });
  sources.KAITEN_API_TOKEN = resolveSharedConfigSource({
    key: "KAITEN_API_TOKEN",
    env: runtime.env,
    storedConfig: fileConfig
  });

  values.KAITEN_API_BASE = resolveSharedConfigValue({
    key: "KAITEN_API_BASE",
    env: runtime.env,
    storedConfig: fileConfig,
    normalizer: normalizeApiBaseValue
  });
  sources.KAITEN_API_BASE = resolveSharedConfigSource({
    key: "KAITEN_API_BASE",
    env: runtime.env,
    storedConfig: fileConfig
  });

  values.KAITEN_BROKEN_API =
    resolveSharedConfigValue({
      key: "KAITEN_BROKEN_API",
      env: runtime.env,
      storedConfig: fileConfig,
      normalizer: normalizeBooleanValue
    }) ?? false;
  sources.KAITEN_BROKEN_API =
    resolveSharedConfigSource({
      key: "KAITEN_BROKEN_API",
      env: runtime.env,
      storedConfig: fileConfig
    }) || "default";

  values.KAITEN_CACHE_DIR =
    resolveSharedConfigValue({
      key: "KAITEN_CACHE_DIR",
      env: runtime.env,
      storedConfig: fileConfig,
      normalizer: normalizeCacheDir
    }) || resolveDefaultCacheDir(runtime);
  sources.KAITEN_CACHE_DIR =
    resolveSharedConfigSource({
      key: "KAITEN_CACHE_DIR",
      env: runtime.env,
      storedConfig: fileConfig
    }) || "default";

  return {
    path: runtime.configPath,
    values,
    sources
  };
}

export async function initGlobalConfig(options = {}) {
  const runtime = resolveRuntime(TOOL_NAME, options);
  const configPath = runtime.configPath;

  if (!options.force && (await configExists(runtime.fsImpl, configPath))) {
    fail(`config file already exists: ${configPath}`, CONFIG_EXIT_CODE);
  }

  const { values, sources } = buildInitConfig(options, runtime.env);
  await writeSharedStoredConfig(values, runtime);

  return {
    path: configPath,
    configured: Object.keys(values),
    sources
  };
}

export function resolveConfigPath(options = {}) {
  return resolveToolConfigPath(TOOL_NAME, options);
}

export function resolveDefaultCacheDir(options = {}) {
  return resolveToolDefaultCacheDir(TOOL_NAME, options);
}

export function normalizeApiBase(value) {
  const normalized = String(value).trim().replace(/\/+$/, "");
  if (!normalized.startsWith("/")) {
    return `/${normalized}`;
  }
  return normalized;
}

function buildInitConfig(options, env) {
  const urlSource = options.kaitenUrl !== undefined ? "flag" : env.KAITEN_URL !== undefined ? "env" : null;
  const tokenSource =
    options.kaitenApiToken !== undefined ? "flag" : env.KAITEN_API_TOKEN !== undefined ? "env" : null;
  const apiBaseSource =
    options.kaitenApiBase !== undefined ? "flag" : env.KAITEN_API_BASE !== undefined ? "env" : null;
  const brokenApiSource =
    options.kaitenBrokenApi !== undefined ? "flag" : env.KAITEN_BROKEN_API !== undefined ? "env" : null;
  const cacheDirSource =
    options.kaitenCacheDir !== undefined ? "flag" : env.KAITEN_CACHE_DIR !== undefined ? "env" : null;

  const url = normalizeKaitenUrl(options.kaitenUrl ?? env.KAITEN_URL, "KAITEN_URL");
  const token = normalizeToken(options.kaitenApiToken ?? env.KAITEN_API_TOKEN, "KAITEN_API_TOKEN");
  const apiBase = normalizeApiBaseValue(
    options.kaitenApiBase ?? env.KAITEN_API_BASE,
    "KAITEN_API_BASE"
  );
  const brokenApi = resolveBrokenApiOption(options, env);
  const cacheDir = normalizeCacheDir(
    options.kaitenCacheDir ?? env.KAITEN_CACHE_DIR,
    "KAITEN_CACHE_DIR"
  );

  const values = {
    ...(url ? { KAITEN_URL: url } : {}),
    ...(token ? { KAITEN_API_TOKEN: token } : {}),
    ...(apiBase ? { KAITEN_API_BASE: apiBase } : {}),
    ...(brokenApi !== null ? { KAITEN_BROKEN_API: brokenApi } : {}),
    ...(cacheDir ? { KAITEN_CACHE_DIR: cacheDir } : {})
  };

  const sources = {
    ...(url ? { KAITEN_URL: urlSource } : {}),
    ...(token ? { KAITEN_API_TOKEN: tokenSource } : {}),
    ...(apiBase ? { KAITEN_API_BASE: apiBaseSource } : {}),
    ...(brokenApi !== null ? { KAITEN_BROKEN_API: brokenApiSource } : {}),
    ...(cacheDir ? { KAITEN_CACHE_DIR: cacheDirSource } : {})
  };

  return { values, sources };
}

function resolveBrokenApiOption(options, env) {
  if (options.kaitenBrokenApi === true) {
    return true;
  }

  if (options.kaitenBrokenApi === false) {
    return false;
  }

  if (env.KAITEN_BROKEN_API !== undefined) {
    return normalizeBooleanValue(env.KAITEN_BROKEN_API, "KAITEN_BROKEN_API");
  }

  return null;
}

function parseHostAndApiBase(rawUrl, rawApiBase) {
  const url = new URL(rawUrl);
  let apiBase = rawApiBase ? normalizeApiBase(rawApiBase) : null;

  if (!apiBase && /^\/api\/(latest|v1)\/?$/.test(url.pathname)) {
    apiBase = normalizeApiBase(url.pathname);
    url.pathname = "/";
  }

  return {
    host: url.origin,
    apiBase: apiBase || "/api/latest"
  };
}

function normalizeKaitenUrl(value, key) {
  return normalizeUrlValue(value, key, { exitCode: CONFIG_EXIT_CODE });
}

function normalizeToken(value, key) {
  return normalizeStringValue(value, key, { exitCode: CONFIG_EXIT_CODE });
}

function normalizeApiBaseValue(value, key) {
  const text = normalizeStringValue(value, key, { exitCode: CONFIG_EXIT_CODE });
  return text ? normalizeApiBase(text) : null;
}

function normalizeCacheDir(value, key) {
  return normalizeStringValue(value, key, { exitCode: CONFIG_EXIT_CODE });
}

function normalizeBooleanValue(value, key) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  fail(`invalid configuration value for ${key}: expected boolean`, CONFIG_EXIT_CODE);
}
