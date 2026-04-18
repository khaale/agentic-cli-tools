import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { pickFields, renderTree, resolveOutputMode, writeOutput } from "../src/lib/output.js";

const execFileAsync = promisify(execFile);
const outputModulePath = fileURLToPath(new URL("../src/lib/output.js", import.meta.url));

test("resolveOutputMode prefers explicit flags and defaults", () => {
  assert.equal(resolveOutputMode("list", { json: true }), "json");
  assert.equal(resolveOutputMode("get", { jsonl: true }), "jsonl");
  assert.equal(resolveOutputMode("raw", {}), "raw");
  assert.equal(resolveOutputMode("list", {}), "jsonl");
  assert.equal(resolveOutputMode("tree", {}), "tree");
  assert.equal(resolveOutputMode("get", {}), "json");
});

test("pickFields narrows objects and lists", () => {
  assert.deepEqual(
    pickFields(
      [
        { id: 1, path: "a", ignored: true },
        { id: 2, path: "b", ignored: false }
      ],
      ["id", "path"]
    ),
    [
      { id: 1, path: "a" },
      { id: 2, path: "b" }
    ]
  );
});

test("renderTree prints a readable hierarchy", () => {
  const tree = {
    label: "platform",
    children: [
      { label: "core", children: [{ label: "project api", children: [] }] },
      { label: "data", children: [] }
    ]
  };

  assert.equal(
    renderTree(tree),
    ["platform", "├─ core", "│  └─ project api", "└─ data"].join("\n")
  );
});

test("writeOutput raw lines mode emits unquoted scalar lines", async () => {
  const result = await runOutputSnippet(`
    import { writeOutput } from ${JSON.stringify(outputModulePath)};
    writeOutput(["platform/api", "platform/web"], "lines");
  `);

  assert.equal(result.stdout, "platform/api\nplatform/web\n");
});

test("writeOutput anonymizes nested GitLab identity fields in json output", async () => {
  const result = await runOutputSnippet(`
    import { writeOutput } from ${JSON.stringify(outputModulePath)};
    writeOutput(
      {
        author: {
          id: 338,
          username: "aleks",
          name: "Aleksander Khanteev"
        }
      },
      "json"
    );
  `);

  assert.match(result.stdout, /"id": 338/);
  assert.match(result.stdout, /"username": "sha256:/);
  assert.match(result.stdout, /"name": "sha256:/);
  assert.doesNotMatch(result.stdout, /Aleksander Khanteev/);
  assert.doesNotMatch(result.stdout, /"username": "aleks"/);
});

async function runOutputSnippet(source) {
  return execFileAsync(process.execPath, ["--input-type=module", "-e", source]);
}
