import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { main } from "../src/cli.js";
import { captureProcess, restoreEnv, runCli } from "./support.js";

test("CLI prints help with no arguments", async () => {
  const result = await captureProcess(async () => {
    await main([]);
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /ktc <subcommand>/);
  assert.match(result.stdout, /tasks - Inspect Kaiten tasks\./);
  assert.match(result.stdout, /config - Manage persisted Kaiten CLI configuration\./);
});

test("CLI reports missing configuration for data commands", async () => {
  const originalUrl = process.env.KAITEN_URL;
  const originalToken = process.env.KAITEN_API_TOKEN;
  const originalHome = process.env.HOME;
  process.env.HOME = await fs.mkdtemp(path.join(os.tmpdir(), "ktc-cli-home-"));
  delete process.env.KAITEN_URL;
  delete process.env.KAITEN_API_TOKEN;

  try {
    const result = await captureProcess(async () => {
      await main(["tasks", "mine"]);
    });

    assert.equal(result.exitCode, 3);
    assert.match(result.stderr, /missing required configuration: KAITEN_URL/);
  } finally {
    restoreEnv("KAITEN_URL", originalUrl);
    restoreEnv("KAITEN_API_TOKEN", originalToken);
    restoreEnv("HOME", originalHome);
  }
});

test("published package metadata does not depend on workspace protocol", async () => {
  const packageJson = JSON.parse(
    await fs.readFile(new URL("../package.json", import.meta.url), "utf8")
  );

  assert.notEqual(packageJson.dependencies?.["@khaale/cli-core"], "workspace:*");
});

test("ktc doctor --json reports config, auth source, and reachability", async () => {
  const originalUrl = process.env.KAITEN_URL;
  const originalToken = process.env.KAITEN_API_TOKEN;
  const originalApiBase = process.env.KAITEN_API_BASE;
  const originalHome = process.env.HOME;
  const originalFetch = globalThis.fetch;

  process.env.HOME = await fs.mkdtemp(path.join(os.tmpdir(), "ktc-cli-home-"));
  process.env.KAITEN_URL = "https://kaiten.example.com";
  process.env.KAITEN_API_TOKEN = "env-token";
  delete process.env.KAITEN_API_BASE;

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/api/latest/spaces");
    assert.equal(init.headers.Authorization, "Bearer env-token");
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
    assert.equal(data.tool, "ktc");
    assert.equal(data.ok, true);
    assert.equal(data.auth.source, "env");
    assert.equal(data.auth.available, true);
    assert.equal(data.checks[0].ok, true);
    assert.deepEqual(data.missing, []);
    assert.doesNotMatch(result.stdout, /env-token/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("KAITEN_URL", originalUrl);
    restoreEnv("KAITEN_API_TOKEN", originalToken);
    restoreEnv("KAITEN_API_BASE", originalApiBase);
    restoreEnv("HOME", originalHome);
  }
});

test("ktc emits JSON error envelopes when --json is requested", async () => {
  const result = await runCli(
    new URL("../bin/ktc.js", import.meta.url),
    ["--json", "tasks", "get"]
  );

  assert.equal(result.exitCode, 1);
  assert.equal(result.stderr, "");
  const data = JSON.parse(result.stdout);
  assert.equal(data.ok, false);
  assert.equal(data.error.code, "cli_error");
  assert.match(data.error.message, /No value provided for --id/);
});

test("ktc api request rejects non-read methods", async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "ktc-cli-home-"));
  const result = await runCli(
    new URL("../bin/ktc.js", import.meta.url),
    ["--json", "api", "request", "--method", "POST", "--path", "/api/latest/spaces"],
    {
      env: {
        HOME: homeDir,
        KAITEN_URL: "https://kaiten.example.com",
        KAITEN_API_TOKEN: "env-token"
      }
    }
  );

  assert.equal(result.exitCode, 2);
  const data = JSON.parse(result.stdout);
  assert.equal(data.ok, false);
  assert.match(data.error.message, /only GET and HEAD are supported/i);
});

test("ktc api request performs read-only JSON requests", async () => {
  const originalUrl = process.env.KAITEN_URL;
  const originalToken = process.env.KAITEN_API_TOKEN;
  const originalApiBase = process.env.KAITEN_API_BASE;
  const originalHome = process.env.HOME;
  const originalFetch = globalThis.fetch;

  process.env.HOME = await fs.mkdtemp(path.join(os.tmpdir(), "ktc-cli-home-"));
  process.env.KAITEN_URL = "https://kaiten.example.com";
  process.env.KAITEN_API_TOKEN = "env-token";
  delete process.env.KAITEN_API_BASE;

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/api/latest/spaces");
    assert.equal(url.searchParams.get("query"), "platform");
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
      await main(["--json", "api", "request", "--path", "/api/latest/spaces", "--query", "query=platform"]);
    });

    assert.equal(result.exitCode, 0);
    assert.deepEqual(JSON.parse(result.stdout), [{ id: 1 }]);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("KAITEN_URL", originalUrl);
    restoreEnv("KAITEN_API_TOKEN", originalToken);
    restoreEnv("KAITEN_API_BASE", originalApiBase);
    restoreEnv("HOME", originalHome);
  }
});
