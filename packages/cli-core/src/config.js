import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fail } from "./errors.js";

const CONFIG_FILE_NAME = "config.json";
const POSIX_DIR_MODE = 0o700;
const POSIX_FILE_MODE = 0o600;

export function resolveConfigPath(toolName, options = {}) {
  const env = options.env !== undefined ? options.env : process.env;
  const homeDir = options.homeDir || os.homedir();
  const platform = options.platform || process.platform;
  const platformPath = pathForPlatform(platform);

  if (platform === "win32") {
    const root =
      env.APPDATA || platformPath.join(env.USERPROFILE || homeDir, "AppData", "Roaming");
    return platformPath.join(root, toolName, CONFIG_FILE_NAME);
  }

  if (platform === "darwin") {
    return platformPath.join(
      homeDir,
      "Library",
      "Application Support",
      toolName,
      CONFIG_FILE_NAME
    );
  }

  return platformPath.join(
    env.XDG_CONFIG_HOME || platformPath.join(homeDir, ".config"),
    toolName,
    CONFIG_FILE_NAME
  );
}

export function resolveDefaultCacheDir(toolName, options = {}) {
  const env = options.env !== undefined ? options.env : process.env;
  const homeDir = options.homeDir || os.homedir();
  const platform = options.platform || process.platform;
  const platformPath = pathForPlatform(platform);

  if (platform === "win32") {
    const root = env.LOCALAPPDATA || platformPath.join(homeDir, "AppData", "Local");
    return platformPath.join(root, toolName, "cache");
  }

  if (platform === "darwin") {
    return platformPath.join(homeDir, "Library", "Caches", toolName);
  }

  return platformPath.join(
    env.XDG_CACHE_HOME || platformPath.join(homeDir, ".cache"),
    toolName
  );
}

export function resolveRuntime(toolName, options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const homeDir = options.homeDir || os.homedir();

  return {
    env,
    platform,
    homeDir,
    fsImpl: options.fsImpl || fs,
    configPath: options.configPath || resolveConfigPath(toolName, { env, platform, homeDir })
  };
}

export async function readStoredConfig(runtime, { keys, normalizers, exitCode = 3 } = {}) {
  try {
    const text = await runtime.fsImpl.readFile(runtime.configPath, "utf8");
    const parsed = JSON.parse(text);

    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      fail(`invalid config JSON at ${runtime.configPath}: expected an object`, exitCode);
    }

    const config = {};

    for (const key of keys) {
      if (!(key in parsed)) {
        continue;
      }

      config[key] = normalizers[key](parsed[key], key);
    }

    return config;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {};
    }

    if (error instanceof SyntaxError) {
      fail(`invalid config JSON at ${runtime.configPath}: ${error.message}`, exitCode);
    }

    throw error;
  }
}

export function resolveConfigValue({ key, env, storedConfig, normalizer }) {
  if (hasConfiguredValue(env[key])) {
    return normalizer(env[key], key);
  }

  if (hasConfiguredValue(storedConfig[key])) {
    return normalizer(storedConfig[key], key);
  }

  return null;
}

export function resolveConfigSource({ key, env, storedConfig }) {
  if (hasConfiguredValue(env[key])) {
    return "env";
  }

  if (hasConfiguredValue(storedConfig[key])) {
    return "config";
  }

  return null;
}

export async function writeStoredConfig(values, runtime, { fileName = CONFIG_FILE_NAME } = {}) {
  const dirPath = path.dirname(runtime.configPath);
  const tempPath = path.join(dirPath, `${fileName}.${process.pid}.${Date.now()}.tmp`);
  const text = `${JSON.stringify(values, null, 2)}\n`;

  await runtime.fsImpl.mkdir(dirPath, { recursive: true, mode: POSIX_DIR_MODE });
  await enforcePosixMode(runtime.fsImpl, dirPath, POSIX_DIR_MODE, runtime.platform);

  try {
    await runtime.fsImpl.writeFile(tempPath, text, { encoding: "utf8", mode: POSIX_FILE_MODE });
    await enforcePosixMode(runtime.fsImpl, tempPath, POSIX_FILE_MODE, runtime.platform);
    await runtime.fsImpl.rename(tempPath, runtime.configPath);
    await enforcePosixMode(runtime.fsImpl, runtime.configPath, POSIX_FILE_MODE, runtime.platform);
  } catch (error) {
    try {
      await runtime.fsImpl.unlink(tempPath);
    } catch (unlinkError) {
      if (unlinkError?.code !== "ENOENT") {
        throw unlinkError;
      }
    }
    throw error;
  }
}

export async function configExists(fsImpl, configPath) {
  try {
    await fsImpl.access(configPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export function normalizeStringValue(value, key, { exitCode = 3 } = {}) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    fail(`invalid configuration value for ${key}: expected string`, exitCode);
  }

  const normalized = value.trim();
  return normalized || null;
}

export function normalizeUrlValue(value, key, { exitCode = 3 } = {}) {
  const text = normalizeStringValue(value, key, { exitCode });
  if (!text) {
    return null;
  }

  try {
    return new URL(text).toString().replace(/\/+$/, "");
  } catch {
    fail(`invalid configuration value for ${key}: ${text}`, exitCode);
  }
}

export function hasConfiguredValue(value) {
  return value !== undefined && value !== null && value !== "";
}

export function redactSecret(value) {
  return value ? "<redacted>" : null;
}

async function enforcePosixMode(fsImpl, targetPath, mode, platform) {
  if (platform === "win32") {
    return;
  }

  await fsImpl.chmod(targetPath, mode);
}

function pathForPlatform(platform) {
  return platform === "win32" ? path.win32 : path.posix;
}
