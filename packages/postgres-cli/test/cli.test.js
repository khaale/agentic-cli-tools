import assert from "node:assert/strict";
import test from "node:test";
import { run } from "../src/cli.js";
import { captureStream, createConfigFile } from "./support.js";

test("CLI lists named sessions in a stable JSON envelope", async () => {
  const { configPath } = await createConfigFile({
    sessions: { qa: { host: "qa.example", database: "app", user: "agent", password: "secret" } }
  });
  const stdout = captureStream();
  const result = await run(["--json", "sessions", "list"], { configPath, stdout });
  const payload = JSON.parse(stdout.value);

  assert.equal(result.exitCode, 0);
  assert.equal(payload.ok, true);
  assert.equal(payload.sessions[0].name, "qa");
  assert.equal(stdout.value.includes('"password"'), false);
  assert.equal(stdout.value.includes('"secret":"secret"'), false);
});

test("CLI returns a JSON error for unsupported commands", async () => {
  const stdout = captureStream();
  const result = await run(["--json", "unknown"], { stdout });
  const payload = JSON.parse(stdout.value);

  assert.equal(result.exitCode, 2);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "cli_error");
});
