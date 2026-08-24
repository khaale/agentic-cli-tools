import assert from "node:assert/strict";
import test from "node:test";
import { assertParameters, assertReadOnlySql, boundedQueryText, normalizeQueryResult } from "../src/lib/query.js";

test("assertReadOnlySql allows bounded read statements and ignores quoted text", () => {
  assert.equal(assertReadOnlySql("SELECT 'update;'"), "SELECT 'update;'");
  assert.equal(assertReadOnlySql("-- select update\nSELECT 1"), "-- select update\nSELECT 1");
  assert.equal(boundedQueryText("SELECT 1", 10), "SELECT * FROM (SELECT 1) AS pgc_result LIMIT 11");
});

test("assertReadOnlySql rejects mutation and control statements", () => {
  for (const sql of ["INSERT INTO users VALUES (1)", "UPDATE users SET name = 'x'", "DROP TABLE users", "SELECT nextval('seq')", "SELECT 1; SELECT 2", "SET statement_timeout = 1"]) {
    assert.throws(() => assertReadOnlySql(sql), /read-only/);
  }
});

test("normalizeQueryResult preserves typed values and enforces output limits", () => {
  const result = normalizeQueryResult({
    fields: [{ name: "id", dataTypeID: 20 }, { name: "created_at", dataTypeID:  timestamptzId() }, { name: "payload", dataTypeID: 17 }],
    rows: [{ id: 1n, created_at: new Date("2026-01-01T00:00:00.000Z"), payload: Buffer.from("ok") }, { id: 2n, created_at: null, payload: Buffer.from("too-large") }]
  }, { rowLimit: 1, byteLimit: 1_000 });

  assert.equal(result.truncated, true);
  assert.deepEqual(result.rows[0].id, { type: "bigint", value: "1" });
  assert.deepEqual(result.rows[0].created_at, { type: "timestamp", value: "2026-01-01T00:00:00.000Z" });
  assert.deepEqual(result.rows[0].payload, { type: "bytea", value: "b2s=" });
  assert.deepEqual(assertParameters(undefined), []);
});

function timestamptzId() {
  return 1184;
}
