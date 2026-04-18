import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { main } from "../src/cli.js";
import { captureProcess, restoreEnv } from "./support.js";

test("CLI prints help with no arguments", async () => {
  const result = await captureProcess(async () => {
    await main([]);
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /ktc <subcommand>/);
  assert.match(result.stdout, /task - Inspect Kaiten tasks\./);
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
      await main(["task", "mine"]);
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
