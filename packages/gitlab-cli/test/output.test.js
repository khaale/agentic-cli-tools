import test from "node:test";
import assert from "node:assert/strict";
import { pickFields, renderTree, resolveOutputMode, writeOutput } from "../src/lib/output.js";
import { captureProcess } from "./support.js";

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
  const result = await captureProcess(async () => {
    writeOutput(["platform/api", "platform/web"], "lines");
  });

  assert.equal(result.stdout, "platform/api\nplatform/web\n");
});

test("writeOutput anonymizes nested GitLab identity fields in json output", async () => {
  const result = await captureProcess(async () => {
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
  });

  assert.match(result.stdout, /"id": 338/);
  assert.match(result.stdout, /"username": "sha256:/);
  assert.match(result.stdout, /"name": "sha256:/);
  assert.doesNotMatch(result.stdout, /Aleksander Khanteev/);
  assert.doesNotMatch(result.stdout, /"username": "aleks"/);
});
