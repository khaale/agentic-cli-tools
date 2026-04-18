import test from "node:test";
import assert from "node:assert/strict";
import { pickFields, renderMarkdown, resolveOutputMode, writeOutput } from "../src/lib/output.js";
import { captureProcess } from "./support.js";

test("resolveOutputMode prefers explicit flags and defaults to markdown", () => {
  assert.equal(resolveOutputMode("list", { json: true }), "json");
  assert.equal(resolveOutputMode("get", { md: true }), "md");
  assert.equal(resolveOutputMode("list", {}), "md");
});

test("pickFields narrows objects and lists", () => {
  assert.deepEqual(
    pickFields(
      [
        { id: 1, title: "a", ignored: true },
        { id: 2, title: "b", ignored: false }
      ],
      ["id", "title"]
    ),
    [
      { id: 1, title: "a" },
      { id: 2, title: "b" }
    ]
  );
});

test("renderMarkdown prints task lists in a readable format", () => {
  const text = renderMarkdown([
    {
      id: 9001,
      title: "Add CLI auth flow",
      status: "in_progress",
      archived: false,
      assignee: { id: 101, full_name: "Alice Example" },
      board: { id: 34, title: "Backend" },
      space: { id: 12, title: "Engineering" },
      column: { id: 502, title: "In progress", type: 2 },
      updated_at: "2026-02-11T10:20:00.000Z"
    }
  ]);

  assert.match(text, /# Tasks \(1\)/);
  assert.match(text, /## 9001 - Add CLI auth flow/);
  assert.match(text, /Status: in_progress/);
  assert.doesNotMatch(text, /Alice Example/);
  assert.match(text, /Assignee: sha256:[a-f0-9]{12}/);
  assert.doesNotMatch(text, /Assignee: sha256:[a-f0-9]{64}/);
});

test("renderMarkdown prints parent and child summaries for a single task", () => {
  const text = renderMarkdown({
    id: 9001,
    title: "Add CLI auth flow",
    status: "in_progress",
    archived: false,
    assignee: { id: 101, full_name: "Alice Example" },
    parents_count: 1,
    children_count: 2,
    children_done: 1,
    parents: [
      {
        id: 8001,
        title: "Epic task",
        status: "open",
        assignee: { id: 102, full_name: "Bob Example" }
      }
    ],
    children: [
      {
        id: 9101,
        title: "Wire API",
        status: "done",
        assignee: { id: 103, full_name: "Carol Example" }
      }
    ]
  });

  assert.match(text, /Parents: 1/);
  assert.match(text, /Children: 2 \(1 done\)/);
  assert.match(text, /## Parents/);
  assert.match(text, /#8001 Epic task \[open\] assignee=sha256:[a-f0-9]{12}/);
  assert.match(text, /## Children/);
  assert.match(text, /#9101 Wire API \[done\] assignee=sha256:[a-f0-9]{12}/);
});

test("writeOutput json mode emits pretty JSON", async () => {
  const result = await captureProcess(async () => {
    writeOutput(
      {
        id: 1,
        title: "Task",
        assignee_id: 101,
        assignee: { id: 101, full_name: "Alice Example", email: "alice@example.com" }
      },
      "json"
    );
  });

  assert.match(result.stdout, /"id": 1/);
  assert.match(result.stdout, /"title": "Task"/);
  assert.doesNotMatch(result.stdout, /Alice Example/);
  assert.doesNotMatch(result.stdout, /alice@example.com/);
  assert.match(result.stdout, /"assignee_id": "sha256:/);
  assert.match(result.stdout, /"hash": "sha256:/);
});
