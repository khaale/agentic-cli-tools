import assert from "node:assert/strict";
import test from "node:test";
import { compareQueries, compareResults } from "../src/lib/compare.js";

test("compareResults classifies equal, changed, left-only, and right-only rows", () => {
  const result = compareResults(
    {
      columns: [{ name: "id" }, { name: "name" }],
      rows: [{ id: 1, name: "same" }, { id: 2, name: "left" }, { id: 3, name: "gone" }],
      truncated: false
    },
    {
      columns: [{ name: "id" }, { name: "name" }],
      rows: [{ id: 1, name: "same" }, { id: 2, name: "right" }, { id: 4, name: "new" }],
      truncated: false
    },
    ["id"]
  );

  assert.equal(result.equal, false);
  assert.deepEqual(result.counts, { equal: 1, changed: 1, leftOnly: 1, rightOnly: 1 });
  assert.deepEqual(result.differences.map((item) => item.kind), ["changed", "left-only", "right-only"]);
});

test("compareResults requires same-named columns and requested keys", () => {
  assert.throws(() => compareResults({ columns: [{ name: "id" }], rows: [] }, { columns: [{ name: "uuid" }], rows: [] }, ["id"]), /key columns are missing/);
  assert.throws(() => compareResults({ columns: [{ name: "id" }, { name: "name" }], rows: [] }, { columns: [{ name: "id" }, { name: "title" }], rows: [] }, ["id"]), /same column names/);
});

test("compareQueries executes independent left and right queries", async () => {
  const calls = [];
  const config = {
    getSession(name) {
      return { name, rowLimit: 10, byteLimit: 10_000, statementTimeoutMs: 1_000 };
    }
  };
  const result = await compareQueries(config, {
    leftSession: "qa",
    rightSession: "uat",
    leftQuery: "SELECT id, name FROM users",
    rightQuery: "SELECT id, name FROM accounts",
    key: "id",
    execute: async (session, sql) => {
      calls.push([session.name, sql]);
      return { columns: [{ name: "id" }, { name: "name" }], rows: [{ id: 1, name: "same" }], truncated: false, rowCount: 1 };
    }
  });

  assert.deepEqual(calls, [["qa", "SELECT id, name FROM users"], ["uat", "SELECT id, name FROM accounts"]]);
  assert.equal(result.equal, true);
  assert.equal(result.complete, true);
});

test("compareResults aligns non-key values by column name regardless of order", () => {
  const result = compareResults(
    { columns: [{ name: "id" }, { name: "name" }, { name: "status" }], rows: [{ id: 1, name: "same", status: "active" }], truncated: false },
    { columns: [{ name: "status" }, { name: "id" }, { name: "name" }], rows: [{ status: "active", id: 1, name: "same" }], truncated: false },
    ["id"]
  );

  assert.equal(result.equal, true);
});

test("compareQueries reports an incomplete source instead of equality", async () => {
  const config = { getSession: (name) => ({ name, rowLimit: 10, byteLimit: 10_000, statementTimeoutMs: 1_000 }) };
  const result = await compareQueries(config, {
    leftSession: "qa",
    rightSession: "uat",
    leftQuery: "SELECT id FROM users",
    rightQuery: "SELECT id FROM users",
    key: "id",
    execute: async (session) => {
      if (session.name === "uat") {
        throw Object.assign(new Error("timeout"), { code: "query_timeout" });
      }
      return { columns: [{ name: "id" }], rows: [{ id: 1 }], truncated: false, rowCount: 1 };
    }
  });

  assert.equal(result.complete, false);
  assert.equal(result.equal, false);
  assert.equal(result.right.status, "error");
});
