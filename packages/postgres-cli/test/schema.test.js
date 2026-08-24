import assert from "node:assert/strict";
import test from "node:test";
import { groupRelationships, relationships, schemaOverview, schemaSearch, tableDetail } from "../src/lib/schema.js";

const session = {
  name: "qa",
  rowLimit: 20,
  byteLimit: 10_000,
  statementTimeoutMs: 1_000
};

function stubConfig(calls) {
  return { getSession: () => session };
}

function executeFactory(calls) {
  return async (_session, sql, parameters) => {
    calls.push({ sql, parameters });
    return { columns: [], rows: [], rowCount: 0, truncated: false };
  };
}

test("schema overview and search use bounded, deterministic catalog queries", async () => {
  const calls = [];
  const execute = executeFactory(calls);
  await schemaOverview(stubConfig(calls), { session: "qa", limit: 10, execute });
  await schemaSearch(stubConfig(calls), { session: "qa", query: "user", schema: "public", type: "table", limit: 5, execute });

  assert.equal(calls[0].sql.includes("pg_catalog.pg_namespace"), true);
  assert.deepEqual(calls[0].parameters, [11]);
  assert.equal(calls[1].sql.includes("comment ILIKE $1"), true);
  assert.equal(calls[1].sql.includes("obj_description"), true);
  assert.equal(calls[1].sql.includes("col_description"), true);
  assert.deepEqual(calls[1].parameters, ["%user%", "public", "table", 6]);
});

test("table detail exposes columns, indexes, constraints, and both relationship directions", async () => {
  const calls = [];
  const execute = executeFactory(calls);
  const result = await tableDetail(stubConfig(calls), { session: "qa", schema: "public", table: "orders", execute });

  assert.equal(calls.length, 6);
  assert.equal(calls.some(({ sql }) => sql.includes("obj_description(rel.oid, 'pg_class') AS comment")), true);
  assert.equal(calls.some(({ sql }) => sql.includes("information_schema.columns")), true);
  assert.equal(calls.some(({ sql }) => sql.includes("pg_catalog.pg_indexes")), true);
  assert.equal(calls.filter(({ sql }) => sql.includes("pg_catalog.pg_constraint")).length, 3);
  assert.deepEqual(Object.keys(result.relationships).sort(), ["incoming", "outgoing"]);
});

test("table detail returns table and column comments when available", async () => {
  const execute = async (_session, sql) => {
    if (sql.includes("obj_description(rel.oid, 'pg_class') AS comment")) {
      return { columns: ["comment", "can_select"], rows: [{ comment: "Orders currently being processed", can_select: true }], rowCount: 1, truncated: false };
    }
    if (sql.includes("col_description(rel.oid, att.attnum) AS comment")) {
      return { columns: ["column_name", "comment"], rows: [{ column_name: "id", comment: "Stable order identifier" }], rowCount: 1, truncated: false };
    }
    return { columns: [], rows: [], rowCount: 0, truncated: false };
  };

  const result = await tableDetail(stubConfig([]), { session: "qa", schema: "public", table: "orders", execute });

  assert.equal(result.table.comment, "Orders currently being processed");
  assert.equal(result.table.availability, "available");
  assert.equal(result.columns.rows[0].comment, "Stable order identifier");
});

test("schema lists expose continuation when the requested limit is reached", async () => {
  const calls = [];
  const execute = async (_session, sql, parameters, options) => {
    calls.push({ sql, parameters, options });
    return {
      columns: [{ name: "schema_name" }],
      rows: [{ schema_name: "first" }],
      rowCount: 1,
      truncated: true
    };
  };

  const result = await schemaOverview(stubConfig(calls), { session: "qa", limit: 1, execute });

  assert.deepEqual(calls[0].parameters, [2]);
  assert.equal(calls[0].options.rowLimit, 1);
  assert.deepEqual(result.continuation, {
    required: true,
    reason: "result_limit",
    hint: "narrow by schema or increase --limit"
  });
});

test("table detail distinguishes a missing table from an accessible table", async () => {
  const result = await tableDetail(stubConfig([]), {
    session: "qa",
    schema: "public",
    table: "missing",
    execute: executeFactory([])
  });

  assert.equal(result.table.availability, "not_found");
});

test("table detail reports inaccessible metadata without treating it as empty success", async () => {
  const execute = async (_session, sql) => {
    if (sql.includes("has_table_privilege")) {
      return { columns: ["comment", "can_select"], rows: [{ comment: null, can_select: false }], rowCount: 1, truncated: false };
    }
    return { columns: [], rows: [], rowCount: 0, truncated: false };
  };

  const result = await tableDetail(stubConfig([]), { session: "qa", schema: "public", table: "restricted", execute });

  assert.equal(result.table.availability, "inaccessible");
});

test("relationships validate direction and return empty directional results", async () => {
  const calls = [];
  const result = await relationships(stubConfig(calls), { session: "qa", schema: "public", table: "users", direction: "incoming", execute: executeFactory(calls) });

  assert.deepEqual(Object.keys(result), ["incoming"]);
  await assert.rejects(relationships(stubConfig(calls), { session: "qa", schema: "public", table: "users", direction: "sideways", execute: executeFactory(calls) }), /unsupported relationship direction/);
});

test("groupRelationships keeps composite foreign-key column order", () => {
  const result = groupRelationships({
    rows: [
      { constraint_name: "fk_pair", source_schema: "public", source_table: "child", target_schema: "public", target_table: "parent", source_column: "b", target_column: "y", column_position: 2 },
      { constraint_name: "fk_pair", source_schema: "public", source_table: "child", target_schema: "public", target_table: "parent", source_column: "a", target_column: "x", column_position: 1 }
    ],
    rowCount: 2
  });

  assert.deepEqual(result.rows[0].columns, [
    { position: 1, source: "a", target: "x" },
    { position: 2, source: "b", target: "y" }
  ]);
});
