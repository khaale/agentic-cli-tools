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

test("resolveConfigPath uses OS-specific config locations", () => {
  assert.equal(
    resolveConfigPath({
      platform: "linux",
      homeDir: "/home/aleks",
      env: { XDG_CONFIG_HOME: "/tmp/xdg-config" }
    }),
    "/tmp/xdg-config/glc/config.json"
  );

  assert.equal(
    resolveConfigPath({
      platform: "darwin",
      homeDir: "/Users/aleks",
      env: {}
    }),
    "/Users/aleks/Library/Application Support/glc/config.json"
  );

  assert.equal(
    resolveConfigPath({
      platform: "win32",
      homeDir: "C:\\Users\\aleks",
      env: { APPDATA: "C:\\Users\\aleks\\AppData\\Roaming" }
    }),
    "C:\\Users\\aleks\\AppData\\Roaming\\glc\\config.json"
  );
});

test("resolveDefaultCacheDir uses OS-specific cache locations", () => {
  assert.equal(
    resolveDefaultCacheDir({
      platform: "linux",
      homeDir: "/home/aleks",
      env: { XDG_CACHE_HOME: "/tmp/xdg-cache" }
    }),
    "/tmp/xdg-cache/glc"
  );

  assert.equal(
    resolveDefaultCacheDir({
      platform: "darwin",
      homeDir: "/Users/aleks",
      env: {}
    }),
    "/Users/aleks/Library/Caches/glc"
  );

  assert.equal(
    resolveDefaultCacheDir({
      platform: "win32",
      homeDir: "C:\\Users\\aleks",
      env: { LOCALAPPDATA: "C:\\Users\\aleks\\AppData\\Local" }
    }),
    "C:\\Users\\aleks\\AppData\\Local\\glc\\cache"
  );
});

test("loadConfig resolves host and token from config with default cache dir", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glc-config-lib-"));
  const configPath = path.join(root, "config.json");

  await fs.writeFile(
    configPath,
    `${JSON.stringify({
      GITLAB_HOST: "https://gitlab.example.com/",
      GITLAB_TOKEN: "config-token"
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
    host: "https://gitlab.example.com",
    token: "config-token",
    cacheDir: "/Users/aleks/Library/Caches/glc",
    taskIdPattern: "#(\\d+)"
  });
});

test("loadConfig merges env values over config values per key", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glc-config-lib-"));
  const configPath = path.join(root, "config.json");

  await fs.writeFile(
    configPath,
    `${JSON.stringify({
      GITLAB_HOST: "https://gitlab.example.com",
      GITLAB_TOKEN: "config-token",
      GITLAB_CACHE_DIR: "/config/cache"
    }, null, 2)}\n`,
    "utf8"
  );

  const config = await loadConfig({
    configPath,
    env: {
      GITLAB_HOST: "https://env.gitlab.example.com/",
      GITLAB_CACHE_DIR: "/env/cache"
    }
  });

  assert.deepEqual(config, {
    host: "https://env.gitlab.example.com",
    token: "config-token",
    cacheDir: "/env/cache",
    taskIdPattern: "#(\\d+)"
  });
});

test("getEffectiveConfigSnapshot reports config, env, and default sources", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glc-config-lib-"));
  const configPath = path.join(root, "config.json");

  await fs.writeFile(
    configPath,
    `${JSON.stringify({
      GITLAB_HOST: "https://gitlab.example.com",
      GITLAB_TOKEN: "config-token"
    }, null, 2)}\n`,
    "utf8"
  );

  const snapshot = await getEffectiveConfigSnapshot({
    configPath,
    homeDir: "/Users/aleks",
    platform: "darwin",
    env: {
      GITLAB_TOKEN: "env-token"
    }
  });

  assert.deepEqual(snapshot.values, {
    GITLAB_HOST: "https://gitlab.example.com",
    GITLAB_TOKEN: "env-token",
    GITLAB_CACHE_DIR: "/Users/aleks/Library/Caches/glc",
    GITLAB_TASK_ID_PATTERN: "#(\\d+)"
  });
  assert.deepEqual(snapshot.sources, {
    GITLAB_HOST: "config",
    GITLAB_TOKEN: "env",
    GITLAB_CACHE_DIR: "default",
    GITLAB_TASK_ID_PATTERN: "default"
  });
});

test("loadConfig supports configured task id pattern with env override", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glc-config-lib-"));
  const configPath = path.join(root, "config.json");

  await fs.writeFile(
    configPath,
    `${JSON.stringify({
      GITLAB_HOST: "https://gitlab.example.com",
      GITLAB_TOKEN: "config-token",
      GITLAB_TASK_ID_PATTERN: "TASK-(\\d+)"
    }, null, 2)}\n`,
    "utf8"
  );

  const config = await loadConfig({
    configPath,
    env: {
      GITLAB_TASK_ID_PATTERN: "#(\\d+)"
    }
  });

  assert.equal(config.taskIdPattern, "#(\\d+)");
});

test("loadConfig rejects malformed JSON config files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glc-config-lib-"));
  const configPath = path.join(root, "config.json");
  await fs.writeFile(configPath, "{not-json", "utf8");

  await assert.rejects(
    () => loadConfig({ configPath, env: {} }),
    /invalid config JSON/
  );
});

test("loadConfig rejects invalid configured host values", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glc-config-lib-"));
  const configPath = path.join(root, "config.json");

  await fs.writeFile(
    configPath,
    `${JSON.stringify({
      GITLAB_HOST: "not-a-url",
      GITLAB_TOKEN: "config-token"
    }, null, 2)}\n`,
    "utf8"
  );

  await assert.rejects(
    () => loadConfig({ configPath, env: {} }),
    /invalid configuration value for GITLAB_HOST/
  );
});

test("loadConfig rejects invalid configured task id pattern values", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glc-config-lib-"));
  const configPath = path.join(root, "config.json");

  await fs.writeFile(
    configPath,
    `${JSON.stringify({
      GITLAB_HOST: "https://gitlab.example.com",
      GITLAB_TOKEN: "config-token",
      GITLAB_TASK_ID_PATTERN: "("
    }, null, 2)}\n`,
    "utf8"
  );

  await assert.rejects(
    () => loadConfig({ configPath, env: {} }),
    /invalid configuration value for GITLAB_TASK_ID_PATTERN/
  );
});
