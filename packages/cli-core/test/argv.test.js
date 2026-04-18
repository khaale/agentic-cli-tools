import test from "node:test";
import assert from "node:assert/strict";
import { createCliArgParser, csvOption, numberOption } from "../src/argv.js";
import { CliError } from "../src/errors.js";

const parseCliArgs = createCliArgParser({
  booleanFlags: ["json", "jsonl", "help"],
  removedFlags: ["all"]
});

test("createCliArgParser parses flags and values", () => {
  const parsed = parseCliArgs(["projects", "list", "--group", "platform", "--jsonl"]);

  assert.equal(parsed.resource, "projects");
  assert.equal(parsed.verb, "list");
  assert.deepEqual(parsed.options, {
    group: "platform",
    jsonl: true
  });
});

test("createCliArgParser rejects removed flags", () => {
  assert.throws(() => parseCliArgs(["projects", "list", "--all"]), (error) => {
    assert.ok(error instanceof CliError);
    assert.match(error.message, /--all is no longer supported/);
    return true;
  });
});

test("numberOption and csvOption keep existing CLI semantics", () => {
  assert.equal(numberOption("4", 2), 4);
  assert.deepEqual(csvOption("id, path"), ["id", "path"]);
});
