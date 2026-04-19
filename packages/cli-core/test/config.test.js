import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  configExists,
  normalizeStringValue,
  normalizeUrlValue,
  readStoredConfig,
  redactSecret,
  resolveConfigPath,
  resolveDefaultCacheDir,
  resolveRuntime,
  resolveConfigSource,
  resolveConfigValue,
  writeStoredConfig
} from "../src/config.js";

test("resolveConfigPath uses OS-specific config locations", () => {
  assert.equal(
    resolveConfigPath("glc", {
      platform: "linux",
      homeDir: "/home/aleks",
      env: { XDG_CONFIG_HOME: "/tmp/xdg-config" }
    }),
    "/tmp/xdg-config/glc/config.json"
  );

  assert.equal(
    resolveConfigPath("glc", {
      platform: "darwin",
      homeDir: "/Users/aleks",
      env: {}
    }),
    path.join("/Users/aleks", "Library", "Application Support", "glc", "config.json")
  );
});

test("resolveDefaultCacheDir uses OS-specific cache locations", () => {
  assert.equal(
    resolveDefaultCacheDir("ktc", {
      platform: "linux",
      homeDir: "/home/aleks",
      env: { XDG_CACHE_HOME: "/tmp/xdg-cache" }
    }),
    "/tmp/xdg-cache/ktc"
  );
});

test("readStoredConfig normalizes stored values and writeStoredConfig persists them", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cli-core-config-"));
  const runtime = resolveRuntime("glc", {
    configPath: path.join(root, "config.json"),
    env: {}
  });

  await writeStoredConfig(
    {
      GITLAB_HOST: "https://gitlab.example.com",
      GITLAB_TOKEN: "token"
    },
    runtime
  );

  assert.equal(await configExists(runtime.fsImpl, runtime.configPath), true);

  const config = await readStoredConfig(runtime, {
    keys: ["GITLAB_HOST", "GITLAB_TOKEN"],
    normalizers: {
      GITLAB_HOST: (value, key) => normalizeUrlValue(value, key),
      GITLAB_TOKEN: (value, key) => normalizeStringValue(value, key)
    }
  });

  assert.deepEqual(config, {
    GITLAB_HOST: "https://gitlab.example.com",
    GITLAB_TOKEN: "token"
  });
});

test("resolveConfigValue and resolveConfigSource honor env precedence", () => {
  const env = { TOKEN: "env-token" };
  const storedConfig = { TOKEN: "config-token" };
  const normalizer = (value) => value;

  assert.equal(resolveConfigValue({ key: "TOKEN", env, storedConfig, normalizer }), "env-token");
  assert.equal(resolveConfigSource({ key: "TOKEN", env, storedConfig }), "env");
  assert.equal(redactSecret("secret"), "<redacted>");
});
