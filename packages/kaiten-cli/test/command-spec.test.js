import test from "node:test";
import assert from "node:assert/strict";
import { parse, runSafely } from "cmd-ts";
import { kaitenCli, normalizeKaitenArgv, unwrapCommandResult } from "../src/lib/command-spec.js";

test("normalizeKaitenArgv supports top-level config shorthand", () => {
  assert.deepEqual(normalizeKaitenArgv(["init", "--force"]), ["config", "init", "--force"]);
});

test("cmd-ts parses kaiten config command output flags", async () => {
  const outcome = await runSafely(kaitenCli, normalizeKaitenArgv([
    "config",
    "path",
    "--fields",
    "path",
    "--json"
  ]));

  assert.equal(outcome._tag, "ok");
  const { outputOptions } = unwrapCommandResult(outcome.value);
  assert.deepEqual(outputOptions.fields, ["path"]);
  assert.equal(outputOptions.json, true);
});

test("cmd-ts accepts free-text tasks search terms natively", async () => {
  const outcome = await parse(kaitenCli, normalizeKaitenArgv([
    "tasks",
    "find",
    "auth",
    "flow"
  ]));

  assert.equal(outcome._tag, "ok");
});

test("cmd-ts rejects unknown resources", async () => {
  const outcome = await runSafely(kaitenCli, normalizeKaitenArgv(["task", "find"]));
  assert.equal(outcome._tag, "error");
  assert.match(stripAnsi(outcome.error.config.message), /Did you mean tasks\?/);
});

function stripAnsi(value) {
  return String(value).replace(/\x1B\[[0-9;]*m/g, "");
}
