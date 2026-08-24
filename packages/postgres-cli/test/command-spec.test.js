import assert from "node:assert/strict";
import test from "node:test";
import { parse, runSafely } from "cmd-ts";
import { pgcCli, normalizePgcArgv } from "../src/lib/command-spec.js";

test("normalizePgcArgv follows shared config shorthand and preserves prefix output flags", () => {
  assert.deepEqual(normalizePgcArgv(["init", "--force"]), ["config", "init", "--force"]);
  assert.deepEqual(normalizePgcArgv(["--json", "path"]), ["config", "path", "--json"]);
  assert.deepEqual(normalizePgcArgv([]), ["--help"]);
});

test("cmd-ts parses pgc query options with generated output flags", async () => {
  const outcome = await parse(pgcCli, [
    "query",
    "--session",
    "qa",
    "--sql-file",
    "queries/orders.sql",
    "--row-limit",
    "5000",
    "--json"
  ]);

  assert.equal(outcome._tag, "ok");
  assert.equal(outcome.value.args.sqlFile, "queries/orders.sql");
  assert.equal(outcome.value.args.rowLimit, 5000);
  assert.equal(outcome.value.args.json, true);
});

test("cmd-ts validates typed and required pgc options before execution", async () => {
  for (const args of [
    ["query", "--sql", "SELECT 1"],
    ["query", "--session", "qa", "--sql", "SELECT 1", "--row-limit", "0"],
    ["schema", "relations", "--session", "qa", "--schema", "public", "--table", "orders", "--direction", "sideways"],
    ["query", "--session", "qa", "--sql", "SELECT 1", "--unknown"]
  ]) {
    const outcome = await runSafely(pgcCli, args);
    assert.equal(outcome._tag, "error");
    assert.match(outcome.error.config.message, /error|must be|unknown|not a valid|missing/i);
  }
});

test("cmd-ts exposes help for top-level and nested pgc commands", async () => {
  const topLevel = await runSafely(pgcCli, ["--help"]);
  const query = await runSafely(pgcCli, ["query", "--help"]);
  const schema = await runSafely(pgcCli, ["schema", "search", "--help"]);

  assert.equal(topLevel._tag, "error");
  assert.equal(topLevel.error.config.exitCode, 0);
  assert.match(topLevel.error.config.message, /schema|compare/);
  assert.equal(query.error.config.exitCode, 0);
  assert.match(query.error.config.message, /--sql-file|--row-limit/);
  assert.equal(schema.error.config.exitCode, 0);
  assert.match(schema.error.config.message, /--query|--type|--schema/);
});

test("nested parse results retain the command result envelope shape", async () => {
  const outcome = await parse(pgcCli, ["schema", "relations", "--session", "qa", "--schema", "public", "--table", "orders"]);
  const parsed = outcome.value.args;

  assert.equal(outcome._tag, "ok");
  assert.equal(parsed.args.direction, undefined);
  assert.equal(parsed.args.session, "qa");
});
