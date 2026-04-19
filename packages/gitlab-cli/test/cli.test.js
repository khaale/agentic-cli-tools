import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { main } from "../src/cli.js";
import { resolveConfigPath } from "../src/lib/config.js";
import { captureProcess, restoreEnv, runCli } from "./support.js";

const binPath = new URL("../bin/glc.js", import.meta.url);

test("CLI prints help with no arguments", async () => {
  const result = await captureProcess(async () => {
    await main([]);
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /glc <subcommand>/);
  assert.match(result.stdout, /groups - Inspect groups and group trees\./);
  assert.match(result.stdout, /mrs - Inspect merge requests\./);
  assert.match(result.stdout, /config - Manage persisted GitLab CLI configuration\./);
});

test("CLI reports missing configuration for data commands", async () => {
  const envSnapshot = snapshotEnv([
    "GITLAB_HOST",
    "GITLAB_TOKEN",
    "GITLAB_CACHE_DIR",
    "GITLAB_TASK_ID_PATTERN",
    "HOME"
  ]);
  process.env.HOME = await fs.mkdtemp(path.join(os.tmpdir(), "glc-cli-home-"));
  delete process.env.GITLAB_HOST;
  delete process.env.GITLAB_TOKEN;
  delete process.env.GITLAB_CACHE_DIR;
  delete process.env.GITLAB_TASK_ID_PATTERN;

  try {
    const result = await captureProcess(async () => {
      await main(["groups", "list"]);
    });

    assert.equal(result.exitCode, 3);
    assert.match(result.stderr, /missing required configuration: GITLAB_HOST/);
  } finally {
    restoreEnvSnapshot(envSnapshot);
  }
});

test("published package metadata does not depend on workspace protocol", async () => {
  const packageJson = JSON.parse(
    await fs.readFile(new URL("../package.json", import.meta.url), "utf8")
  );

  assert.notEqual(packageJson.dependencies?.["@khaale/cli-core"], "workspace:*");
});

test("config init writes config.json using env fallback", async () => {
  const envSnapshot = snapshotEnv([
    "GITLAB_HOST",
    "GITLAB_TOKEN",
    "GITLAB_CACHE_DIR",
    "GITLAB_TASK_ID_PATTERN",
    "HOME"
  ]);
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "glc-cli-home-"));
  process.env.HOME = homeDir;
  process.env.GITLAB_HOST = "https://gitlab.example.com/";
  process.env.GITLAB_TOKEN = "env-token";
  delete process.env.GITLAB_CACHE_DIR;
  process.env.GITLAB_TASK_ID_PATTERN = "TASK-(\\d+)";

  try {
    const result = await runCli(binPath, ["config", "init"], {
      clearEnv: true,
      env: {
        HOME: homeDir,
        GITLAB_HOST: "https://gitlab.example.com/",
        GITLAB_TOKEN: "env-token",
        GITLAB_TASK_ID_PATTERN: "TASK-(\\d+)"
      }
    });

    assert.equal(result.exitCode, 0);
    const data = JSON.parse(result.stdout);
    assert.equal(
      data.path,
      resolveConfigPath({ homeDir, env: {} })
    );
    assert.deepEqual(data.configured.sort(), ["GITLAB_HOST", "GITLAB_TASK_ID_PATTERN", "GITLAB_TOKEN"]);
    assert.deepEqual(data.sources, {
      GITLAB_HOST: "env",
      GITLAB_TASK_ID_PATTERN: "env",
      GITLAB_TOKEN: "env"
    });
    assert.doesNotMatch(result.stdout, /https:\/\/gitlab\.example\.com/);
    assert.doesNotMatch(result.stdout, /env-token/);

    const written = JSON.parse(await fs.readFile(data.path, "utf8"));
    assert.deepEqual(written, {
      GITLAB_HOST: "https://gitlab.example.com",
      GITLAB_TOKEN: "env-token",
      GITLAB_TASK_ID_PATTERN: "TASK-(\\d+)"
    });
  } finally {
    restoreEnvSnapshot(envSnapshot);
  }
});

test("config init can create an empty config scaffold", async () => {
  const envSnapshot = snapshotEnv([
    "GITLAB_HOST",
    "GITLAB_TOKEN",
    "GITLAB_CACHE_DIR",
    "GITLAB_TASK_ID_PATTERN",
    "HOME"
  ]);
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "glc-cli-home-"));
  process.env.HOME = homeDir;
  delete process.env.GITLAB_HOST;
  delete process.env.GITLAB_TOKEN;
  delete process.env.GITLAB_CACHE_DIR;
  delete process.env.GITLAB_TASK_ID_PATTERN;

  try {
    const result = await runCli(binPath, ["config", "init"], {
      clearEnv: true,
      env: { HOME: homeDir }
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

test("config init requires --force to overwrite an existing config", async () => {
  const envSnapshot = snapshotEnv([
    "GITLAB_HOST",
    "GITLAB_TOKEN",
    "GITLAB_CACHE_DIR",
    "GITLAB_TASK_ID_PATTERN",
    "HOME"
  ]);
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "glc-cli-home-"));
  const configDir = path.dirname(resolveConfigPath({ homeDir, env: {} }));
  const configPath = path.join(configDir, "config.json");

  process.env.HOME = homeDir;
  process.env.GITLAB_HOST = "https://gitlab.example.com";
  process.env.GITLAB_TOKEN = "env-token";
  delete process.env.GITLAB_TASK_ID_PATTERN;

  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    configPath,
    `${JSON.stringify({
      GITLAB_HOST: "https://old.gitlab.example.com",
      GITLAB_TOKEN: "old-token",
      EXTRA_KEY: "keep-me"
    }, null, 2)}\n`,
    "utf8"
  );

  try {
    const failed = await captureProcess(async () => {
      await main(["config", "init"]);
    });

    assert.equal(failed.exitCode, 3);
    assert.match(failed.stderr, /config file already exists/);

    const success = await captureProcess(async () => {
      await main(["config", "init", "--force", "--gitlab-token", "forced-token"]);
    });

    assert.equal(success.exitCode, 0);
    const written = JSON.parse(await fs.readFile(configPath, "utf8"));
    assert.deepEqual(written, {
      GITLAB_HOST: "https://gitlab.example.com",
      GITLAB_TOKEN: "forced-token"
    });
  } finally {
    restoreEnvSnapshot(envSnapshot);
  }
});

test("config init checks for existing config before requiring env values", async () => {
  const envSnapshot = snapshotEnv([
    "GITLAB_HOST",
    "GITLAB_TOKEN",
    "GITLAB_CACHE_DIR",
    "GITLAB_TASK_ID_PATTERN",
    "HOME"
  ]);
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "glc-cli-home-"));
  const configDir = path.dirname(resolveConfigPath({ homeDir, env: {} }));
  const configPath = path.join(configDir, "config.json");

  process.env.HOME = homeDir;
  delete process.env.GITLAB_HOST;
  delete process.env.GITLAB_TOKEN;
  delete process.env.GITLAB_CACHE_DIR;
  delete process.env.GITLAB_TASK_ID_PATTERN;

  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    configPath,
    `${JSON.stringify({
      GITLAB_HOST: "https://gitlab.example.com",
      GITLAB_TOKEN: "config-token"
    }, null, 2)}\n`,
    "utf8"
  );

  try {
    const result = await captureProcess(async () => {
      await main(["config", "init"]);
    });

    assert.equal(result.exitCode, 3);
    assert.match(result.stderr, /config file already exists/);
    assert.doesNotMatch(result.stderr, /missing required configuration: GITLAB_HOST/);
  } finally {
    restoreEnvSnapshot(envSnapshot);
  }
});

test("config get returns path and configured parameter names only", async () => {
  const envSnapshot = snapshotEnv([
    "GITLAB_HOST",
    "GITLAB_TOKEN",
    "GITLAB_CACHE_DIR",
    "GITLAB_TASK_ID_PATTERN",
    "HOME"
  ]);
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "glc-cli-home-"));
  const configDir = path.dirname(resolveConfigPath({ homeDir, env: {} }));
  const configPath = path.join(configDir, "config.json");

  process.env.HOME = homeDir;
  process.env.GITLAB_TOKEN = "env-token";
  process.env.GITLAB_TASK_ID_PATTERN = "TASK-(\\d+)";
  delete process.env.GITLAB_HOST;
  delete process.env.GITLAB_CACHE_DIR;

  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    configPath,
    `${JSON.stringify({
      GITLAB_HOST: "https://gitlab.example.com",
      GITLAB_TOKEN: "config-token"
    }, null, 2)}\n`,
    "utf8"
  );

  try {
    const result = await runCli(binPath, ["config", "get"], {
      clearEnv: true,
      env: {
        HOME: homeDir,
        GITLAB_TOKEN: "env-token",
        GITLAB_TASK_ID_PATTERN: "TASK-(\\d+)"
      }
    });

    assert.equal(result.exitCode, 0);
    const data = JSON.parse(result.stdout);
    assert.equal(data.path, configPath);
    assert.deepEqual(data.configured.sort(), ["GITLAB_HOST", "GITLAB_TASK_ID_PATTERN", "GITLAB_TOKEN"]);
    assert.doesNotMatch(result.stdout, /https:\/\/gitlab\.example\.com/);
    assert.doesNotMatch(result.stdout, /env-token/);
    assert.doesNotMatch(result.stdout, /TASK-\(\\d\+\)/);
  } finally {
    restoreEnvSnapshot(envSnapshot);
  }
});

test("config path prints the resolved absolute config path", async () => {
  const envSnapshot = snapshotEnv(["HOME"]);
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "glc-cli-home-"));
  process.env.HOME = homeDir;

  try {
    const result = await runCli(binPath, ["config", "path"], {
      clearEnv: true,
      env: { HOME: homeDir }
    });

    assert.equal(result.exitCode, 0);
    assert.equal(
      result.stdout,
      `${resolveConfigPath({ homeDir, env: {} })}\n`
    );
  } finally {
    restoreEnvSnapshot(envSnapshot);
  }
});

test("data commands work with config-only authentication", async () => {
  const envSnapshot = snapshotEnv([
    "GITLAB_HOST",
    "GITLAB_TOKEN",
    "GITLAB_CACHE_DIR",
    "GITLAB_TASK_ID_PATTERN",
    "HOME"
  ]);
  const originalFetch = globalThis.fetch;
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "glc-cli-home-"));
  const configDir = path.dirname(resolveConfigPath({ homeDir, env: {} }));
  const configPath = path.join(configDir, "config.json");

  process.env.HOME = homeDir;
  delete process.env.GITLAB_HOST;
  delete process.env.GITLAB_TOKEN;
  delete process.env.GITLAB_CACHE_DIR;
  delete process.env.GITLAB_TASK_ID_PATTERN;

  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    configPath,
    `${JSON.stringify({
      GITLAB_HOST: "https://gitlab.example.com",
      GITLAB_TOKEN: "config-token"
    }, null, 2)}\n`,
    "utf8"
  );

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://gitlab.example.com");
    assert.equal(url.pathname, "/api/v4/groups");
    assert.equal(url.searchParams.get("all_available"), "true");
    assert.equal(url.searchParams.get("page"), "1");
    assert.equal(url.searchParams.get("per_page"), "100");
    assert.equal(init.headers["PRIVATE-TOKEN"], "config-token");
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => [
        {
          id: 1,
          path: "platform",
          full_path: "platform",
          web_url: "https://gitlab.example.com/platform"
        }
      ],
      text: async () => JSON.stringify([
        {
          id: 1,
          path: "platform",
          full_path: "platform",
          web_url: "https://gitlab.example.com/platform"
        }
      ]),
      headers: {
        get(name) {
          if (name.toLowerCase() === "x-next-page") {
            return "";
          }

          if (name.toLowerCase() === "content-type") {
            return "application/json";
          }

          return null;
        }
      }
    };
  };

  try {
    const result = await captureProcess(async () => {
      await main(["groups", "list"]);
    });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /"path_with_namespace":"platform"/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvSnapshot(envSnapshot);
  }
});

test("doctor --json reports config, auth source, and reachability", async () => {
  const envSnapshot = snapshotEnv([
    "GITLAB_HOST",
    "GITLAB_TOKEN",
    "GITLAB_CACHE_DIR",
    "GITLAB_TASK_ID_PATTERN",
    "HOME"
  ]);
  const originalFetch = globalThis.fetch;
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "glc-cli-home-"));

  process.env.HOME = homeDir;
  process.env.GITLAB_HOST = "https://gitlab.example.com";
  process.env.GITLAB_TOKEN = "env-token";
  delete process.env.GITLAB_CACHE_DIR;
  delete process.env.GITLAB_TASK_ID_PATTERN;

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/api/v4/groups");
    assert.equal(init.headers["PRIVATE-TOKEN"], "env-token");
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => [],
      text: async () => "[]",
      headers: { get: () => null }
    };
  };

  try {
    const result = await captureProcess(async () => {
      await main(["--json", "doctor"]);
    });

    assert.equal(result.exitCode, 0);
    const data = JSON.parse(result.stdout);
    assert.equal(data.tool, "glc");
    assert.equal(data.ok, true);
    assert.equal(data.auth.source, "env");
    assert.equal(data.auth.available, true);
    // In docotor output, missing will have the host if not matched, but here it matches
    assert.deepEqual(data.missing, []);
    assert.doesNotMatch(result.stdout, /env-token/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvSnapshot(envSnapshot);
  }
});

test("glc emits JSON error envelopes when --json is requested", async () => {
  const result = await runCli(
    new URL("../bin/glc.js", import.meta.url),
    ["--json", "groups", "get"]
  );

  assert.equal(result.exitCode, 1);
  assert.equal(result.stderr, "");
  const data = JSON.parse(result.stdout);
  assert.equal(data.ok, false);
  assert.equal(data.error.code, "cli_error");
  assert.match(data.error.message, /No value provided for --group/);
});

test("glc api request rejects non-read methods", async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "glc-cli-home-"));
  const result = await runCli(
    new URL("../bin/glc.js", import.meta.url),
    ["--json", "api", "request", "--method", "POST", "--path", "/api/v4/groups"],
    {
      env: {
        HOME: homeDir,
        GITLAB_HOST: "https://gitlab.example.com",
        GITLAB_TOKEN: "env-token"
      }
    }
  );

  assert.equal(result.exitCode, 2);
  const data = JSON.parse(result.stdout);
  assert.equal(data.ok, false);
  assert.match(data.error.message, /only GET and HEAD are supported/i);
});

test("glc api request performs read-only JSON requests", async () => {
  const envSnapshot = snapshotEnv([
    "GITLAB_HOST",
    "GITLAB_TOKEN",
    "GITLAB_CACHE_DIR",
    "GITLAB_TASK_ID_PATTERN",
    "HOME"
  ]);
  const originalFetch = globalThis.fetch;
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "glc-cli-home-"));

  process.env.HOME = homeDir;
  process.env.GITLAB_HOST = "https://gitlab.example.com";
  process.env.GITLAB_TOKEN = "env-token";
  delete process.env.GITLAB_CACHE_DIR;
  delete process.env.GITLAB_TASK_ID_PATTERN;

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/api/v4/groups");
    assert.equal(url.searchParams.get("search"), "platform");
    assert.equal(init.method, "GET");
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => [{ id: 1 }],
      text: async () => '[{"id":1}]',
      headers: { get: () => null }
    };
  };

  try {
    const result = await captureProcess(async () => {
      await main(["--json", "api", "request", "--path", "/api/v4/groups", "--query", "search=platform"]);
    });

    assert.equal(result.exitCode, 0);
    assert.deepEqual(JSON.parse(result.stdout), [{ id: 1 }]);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvSnapshot(envSnapshot);
  }
});

function snapshotEnv(keys) {
  const allKeys = [...new Set([...keys, "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_RUNTIME_DIR"])];
  return Object.fromEntries(allKeys.map((key) => [key, process.env[key]]));
}

function restoreEnvSnapshot(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    restoreEnv(key, value);
  }
}
