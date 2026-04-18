import test from "node:test";
import assert from "node:assert/strict";
import { runSafely } from "cmd-ts";
import { normalizeGitLabArgv, gitLabCli, unwrapCommandResult } from "../src/lib/command-spec.js";

test("normalizeGitLabArgv supports top-level config shorthand", () => {
  assert.deepEqual(normalizeGitLabArgv(["init", "--force"]), ["config", "init", "--force"]);
});

test("cmd-ts parses verb-specific GitLab inputs", async () => {
  const outcome = await runSafely(gitLabCli, normalizeGitLabArgv([
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

test("cmd-ts validates required selectors before execution", async () => {
  const outcome = await runSafely(gitLabCli, normalizeGitLabArgv([
    "mrs",
    "snapshot",
    "--project",
    "team/api",
    "--mr",
    "42"
  ]));

  assert.equal(outcome._tag, "error");
  assert.match(outcome.error.config.message, /--output-dir/);
});

test("cmd-ts rejects unknown resources", async () => {
  const outcome = await runSafely(gitLabCli, normalizeGitLabArgv(["unknown", "list"]));
  assert.equal(outcome._tag, "error");
  assert.match(outcome.error.config.message, /unknown/i);
});
