import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  getEffectiveConfigSnapshot,
  loadConfig,
  resolveConfigPath,
  resolveDefaultCacheDir
} from "../src/lib/config.js";
import { main } from "../src/cli.js";
import { captureProcess, restoreEnv } from "./support.js";

test("resolveConfigPath uses OS-specific config locations", () => {
  assert.equal(
    resolveConfigPath({
      platform: "linux",
      homeDir: "/home/aleks",
      env: { XDG_CONFIG_HOME: "/tmp/xdg-config" }
    }),
    "/tmp/xdg-config/ktc/config.json"
  );

  assert.equal(
    resolveConfigPath({
      platform: "darwin",
      homeDir: "/Users/aleks",
      env: {}
    }),
    "/Users/aleks/Library/Application Support/ktc/config.json"
  );
});

test("resolveDefaultCacheDir uses OS-specific cache locations", () => {
  assert.equal(
    resolveDefaultCacheDir({
      platform: "linux",
      homeDir: "/home/aleks",
      env: { XDG_CACHE_HOME: "/tmp/xdg-cache" }
    }),
    "/tmp/xdg-cache/ktc"
  );
});

test("loadConfig resolves values from config with defaults", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ktc-config-lib-"));
  const configPath = path.join(root, "config.json");

  await fs.writeFile(
    configPath,
    `${JSON.stringify({
      KAITEN_URL: "https://kaiten.example.com/",
      KAITEN_API_TOKEN: "config-token"
    }, null, 2)}\n`,
    "utf8"
  );

  const config = await loadConfig({
    configPath,
    homeDir: "/Users/aleks",
    platform: "darwin",
    env: {}
  });

  assert.deepEqual(config, {
    host: "https://kaiten.example.com",
    apiBase: "/api/latest",
    token: "config-token",
    brokenApi: false,
    cacheDir: "/Users/aleks/Library/Caches/ktc"
  });
});

test("loadConfig merges env values over config values per key", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ktc-config-lib-"));
  const configPath = path.join(root, "config.json");

  await fs.writeFile(
    configPath,
    `${JSON.stringify({
      KAITEN_URL: "https://kaiten.example.com",
      KAITEN_API_TOKEN: "config-token",
      KAITEN_API_BASE: "/api/v1",
      KAITEN_CACHE_DIR: "/config/cache"
    }, null, 2)}\n`,
    "utf8"
  );

  const config = await loadConfig({
    configPath,
    env: {
      KAITEN_URL: "https://env.kaiten.example.com/",
      KAITEN_CACHE_DIR: "/env/cache"
    }
  });

  assert.deepEqual(config, {
    host: "https://env.kaiten.example.com",
    apiBase: "/api/v1",
    token: "config-token",
    brokenApi: false,
    cacheDir: "/env/cache"
  });
});

test("getEffectiveConfigSnapshot reports config, env, and default sources", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ktc-config-lib-"));
  const configPath = path.join(root, "config.json");

  await fs.writeFile(
    configPath,
    `${JSON.stringify({
      KAITEN_URL: "https://kaiten.example.com",
      KAITEN_API_TOKEN: "config-token"
    }, null, 2)}\n`,
    "utf8"
  );

  const snapshot = await getEffectiveConfigSnapshot({
    configPath,
    homeDir: "/Users/aleks",
    platform: "darwin",
    env: {
      KAITEN_API_TOKEN: "env-token"
    }
  });

  assert.deepEqual(snapshot.values, {
    KAITEN_URL: "https://kaiten.example.com",
    KAITEN_API_TOKEN: "env-token",
    KAITEN_API_BASE: null,
    KAITEN_BROKEN_API: false,
    KAITEN_CACHE_DIR: "/Users/aleks/Library/Caches/ktc"
  });
  assert.deepEqual(snapshot.sources, {
    KAITEN_URL: "config",
    KAITEN_API_TOKEN: "env",
    KAITEN_API_BASE: null,
    KAITEN_BROKEN_API: "default",
    KAITEN_CACHE_DIR: "default"
  });
});

test("config init writes config.json using env fallback", async () => {
  const envSnapshot = snapshotEnv([
    "KAITEN_URL",
    "KAITEN_API_TOKEN",
    "KAITEN_API_BASE",
    "KAITEN_BROKEN_API",
    "KAITEN_CACHE_DIR",
    "HOME"
  ]);
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "ktc-cli-home-"));
  process.env.HOME = homeDir;
  process.env.KAITEN_URL = "https://kaiten.example.com";
  process.env.KAITEN_API_TOKEN = "env-token";
  process.env.KAITEN_API_BASE = "/api/v1";
  delete process.env.KAITEN_BROKEN_API;
  delete process.env.KAITEN_CACHE_DIR;

  try {
    const result = await captureProcess(async () => {
      await main(["config", "init"]);
    });

    assert.equal(result.exitCode, 0);
    const data = JSON.parse(result.stdout);
    assert.equal(
      data.path,
      path.join(homeDir, "Library", "Application Support", "ktc", "config.json")
    );
    assert.deepEqual(data.configured.sort(), [
      "KAITEN_API_BASE",
      "KAITEN_API_TOKEN",
      "KAITEN_URL"
    ]);
    assert.deepEqual(data.sources, {
      KAITEN_URL: "env",
      KAITEN_API_TOKEN: "env",
      KAITEN_API_BASE: "env"
    });
    assert.doesNotMatch(result.stdout, /https:\/\/kaiten\.example\.com/);
    assert.doesNotMatch(result.stdout, /env-token/);

    const written = JSON.parse(await fs.readFile(data.path, "utf8"));
    assert.deepEqual(written, {
      KAITEN_URL: "https://kaiten.example.com",
      KAITEN_API_TOKEN: "env-token",
      KAITEN_API_BASE: "/api/v1"
    });
  } finally {
    restoreEnvSnapshot(envSnapshot);
  }
});

test("config init can create an empty config scaffold", async () => {
  const envSnapshot = snapshotEnv([
    "KAITEN_URL",
    "KAITEN_API_TOKEN",
    "KAITEN_API_BASE",
    "KAITEN_BROKEN_API",
    "KAITEN_CACHE_DIR",
    "HOME"
  ]);
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "ktc-cli-home-"));
  process.env.HOME = homeDir;
  delete process.env.KAITEN_URL;
  delete process.env.KAITEN_API_TOKEN;
  delete process.env.KAITEN_API_BASE;
  delete process.env.KAITEN_BROKEN_API;
  delete process.env.KAITEN_CACHE_DIR;

  try {
    const result = await captureProcess(async () => {
      await main(["config", "init"]);
    });

    assert.equal(result.exitCode, 0);
    const data = JSON.parse(result.stdout);
    assert.deepEqual(data.configured, []);
    assert.deepEqual(data.sources, {});

    const written = JSON.parse(await fs.readFile(data.path, "utf8"));
    assert.deepEqual(written, {});
  } finally {
    restoreEnvSnapshot(envSnapshot);
  }
});

test("config get returns path and configured parameter names only", async () => {
  const envSnapshot = snapshotEnv([
    "KAITEN_URL",
    "KAITEN_API_TOKEN",
    "KAITEN_API_BASE",
    "KAITEN_BROKEN_API",
    "KAITEN_CACHE_DIR",
    "HOME"
  ]);
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "ktc-cli-home-"));
  const configDir = path.join(homeDir, "Library", "Application Support", "ktc");
  const configPath = path.join(configDir, "config.json");

  process.env.HOME = homeDir;
  process.env.KAITEN_API_TOKEN = "env-token";
  delete process.env.KAITEN_URL;
  delete process.env.KAITEN_API_BASE;
  delete process.env.KAITEN_BROKEN_API;
  delete process.env.KAITEN_CACHE_DIR;

  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    configPath,
    `${JSON.stringify({
      KAITEN_URL: "https://kaiten.example.com",
      KAITEN_API_TOKEN: "config-token"
    }, null, 2)}\n`,
    "utf8"
  );

  try {
    const result = await captureProcess(async () => {
      await main(["config", "get"]);
    });

    assert.equal(result.exitCode, 0);
    const data = JSON.parse(result.stdout);
    assert.equal(data.path, configPath);
    assert.deepEqual(data.configured.sort(), ["KAITEN_API_TOKEN", "KAITEN_URL"]);
    assert.doesNotMatch(result.stdout, /https:\/\/kaiten\.example\.com/);
    assert.doesNotMatch(result.stdout, /env-token/);
  } finally {
    restoreEnvSnapshot(envSnapshot);
  }
});

test("config path prints the resolved absolute config path", async () => {
  const envSnapshot = snapshotEnv(["HOME"]);
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "ktc-cli-home-"));
  process.env.HOME = homeDir;

  try {
    const result = await captureProcess(async () => {
      await main(["config", "path"]);
    });

    assert.equal(result.exitCode, 0);
    assert.equal(
      result.stdout,
      `${path.join(homeDir, "Library", "Application Support", "ktc", "config.json")}\n`
    );
  } finally {
    restoreEnvSnapshot(envSnapshot);
  }
});

function snapshotEnv(keys) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnvSnapshot(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    restoreEnv(key, value);
  }
}
