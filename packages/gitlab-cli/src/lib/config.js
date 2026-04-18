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
const CONFIG_KEYS = ["GITLAB_HOST", "GITLAB_TOKEN", "GITLAB_CACHE_DIR", "GITLAB_TASK_ID_PATTERN"];
const TOOL_NAME = "glc";
const DEFAULT_TASK_ID_PATTERN = "#(\\d+)";

export async function loadConfig(options = {}) {
  const snapshot = await getEffectiveConfigSnapshot(options);

  if (!snapshot.values.GITLAB_HOST) {
    fail("missing required configuration: GITLAB_HOST", CONFIG_EXIT_CODE);
  }

  if (!snapshot.values.GITLAB_TOKEN) {
    fail("missing required configuration: GITLAB_TOKEN", CONFIG_EXIT_CODE);
  }

  return {
    host: snapshot.values.GITLAB_HOST,
    token: snapshot.values.GITLAB_TOKEN,
    cacheDir: snapshot.values.GITLAB_CACHE_DIR,
    taskIdPattern: snapshot.values.GITLAB_TASK_ID_PATTERN
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
      GITLAB_HOST: normalizeHost,
      GITLAB_TOKEN: normalizeToken,
      GITLAB_CACHE_DIR: normalizeCacheDir,
      GITLAB_TASK_ID_PATTERN: normalizeTaskIdPattern
    },
    exitCode: CONFIG_EXIT_CODE
  });
  const values = {};
  const sources = {};

  values.GITLAB_HOST = resolveSharedConfigValue({
    key: "GITLAB_HOST",
    env: runtime.env,
    storedConfig: fileConfig,
    normalizer: normalizeHost
  });
  sources.GITLAB_HOST = resolveSharedConfigSource({
    key: "GITLAB_HOST",
    env: runtime.env,
    storedConfig: fileConfig
  });

  values.GITLAB_TOKEN = resolveSharedConfigValue({
    key: "GITLAB_TOKEN",
    env: runtime.env,
    storedConfig: fileConfig,
    normalizer: normalizeToken
  });
  sources.GITLAB_TOKEN = resolveSharedConfigSource({
    key: "GITLAB_TOKEN",
    env: runtime.env,
    storedConfig: fileConfig
  });

  values.GITLAB_CACHE_DIR =
    resolveSharedConfigValue({
      key: "GITLAB_CACHE_DIR",
      env: runtime.env,
      storedConfig: fileConfig,
      normalizer: normalizeCacheDir
    }) || resolveDefaultCacheDir(runtime);
  sources.GITLAB_CACHE_DIR =
    resolveSharedConfigSource({
      key: "GITLAB_CACHE_DIR",
      env: runtime.env,
      storedConfig: fileConfig
    }) || "default";

  values.GITLAB_TASK_ID_PATTERN =
    resolveSharedConfigValue({
      key: "GITLAB_TASK_ID_PATTERN",
      env: runtime.env,
      storedConfig: fileConfig,
      normalizer: normalizeTaskIdPattern
    }) || DEFAULT_TASK_ID_PATTERN;
  sources.GITLAB_TASK_ID_PATTERN =
    resolveSharedConfigSource({
      key: "GITLAB_TASK_ID_PATTERN",
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
  await writeStoredConfig(values, runtime);

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

function buildInitConfig(options, env) {
  const hostSource = options.gitlabHost !== undefined ? "flag" : env.GITLAB_HOST !== undefined ? "env" : null;
  const tokenSource = options.gitlabToken !== undefined ? "flag" : env.GITLAB_TOKEN !== undefined ? "env" : null;
  const cacheDirSource =
    options.gitlabCacheDir !== undefined ? "flag" : env.GITLAB_CACHE_DIR !== undefined ? "env" : null;
  const taskIdPatternSource =
    options.gitlabTaskIdPattern !== undefined ? "flag" : env.GITLAB_TASK_ID_PATTERN !== undefined ? "env" : null;

  const host = normalizeHost(options.gitlabHost ?? env.GITLAB_HOST, "GITLAB_HOST");
  const token = normalizeToken(options.gitlabToken ?? env.GITLAB_TOKEN, "GITLAB_TOKEN");
  const cacheDir = normalizeCacheDir(options.gitlabCacheDir ?? env.GITLAB_CACHE_DIR, "GITLAB_CACHE_DIR");
  const taskIdPattern = normalizeTaskIdPattern(
    options.gitlabTaskIdPattern ?? env.GITLAB_TASK_ID_PATTERN,
    "GITLAB_TASK_ID_PATTERN"
  );

  const values = {
    ...(host ? { GITLAB_HOST: host } : {}),
    ...(token ? { GITLAB_TOKEN: token } : {}),
    ...(cacheDir ? { GITLAB_CACHE_DIR: cacheDir } : {}),
    ...(taskIdPattern ? { GITLAB_TASK_ID_PATTERN: taskIdPattern } : {})
  };

  const sources = {
    ...(host ? { GITLAB_HOST: hostSource } : {}),
    ...(token ? { GITLAB_TOKEN: tokenSource } : {}),
    ...(cacheDir ? { GITLAB_CACHE_DIR: cacheDirSource } : {}),
    ...(taskIdPattern ? { GITLAB_TASK_ID_PATTERN: taskIdPatternSource } : {})
  };

  return { values, sources };
}

async function writeStoredConfig(values, runtime) {
  return writeSharedStoredConfig(values, runtime);
}

function normalizeHost(value, key) {
  return normalizeUrlValue(value, key, { exitCode: CONFIG_EXIT_CODE });
}

function normalizeToken(value, key) {
  return normalizeStringValue(value, key, { exitCode: CONFIG_EXIT_CODE });
}

function normalizeCacheDir(value, key) {
  return normalizeStringValue(value, key, { exitCode: CONFIG_EXIT_CODE });
}

function normalizeTaskIdPattern(value, key) {
  const pattern = normalizeStringValue(value, key, { exitCode: CONFIG_EXIT_CODE });
  if (!pattern) {
    return null;
  }

  try {
    new RegExp(pattern, "u");
  } catch {
    fail(`invalid configuration value for ${key}: ${pattern}`, CONFIG_EXIT_CODE);
  }

  return pattern;
}
