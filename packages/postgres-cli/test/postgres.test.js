import assert from "node:assert/strict";
import test from "node:test";
import { executeReadQuery, diagnoseSession } from "../src/lib/postgres.js";
import { sanitizeDatabaseError } from "../src/lib/errors.js";
import { fakeClient } from "./support.js";

const session = {
  name: "qa",
  host: "qa.example",
  port: 5432,
  database: "app",
  user: "agent",
  password: "secret",
  rowLimit: 10,
  byteLimit: 10_000,
  statementTimeoutMs: 1_000
};

test("executeReadQuery uses a read-only transaction and always cleans up", async () => {
  const client = fakeClient({ rows: [{ id: 1 }] });
  const result = await executeReadQuery(session, "SELECT 1 AS id", [], { clientFactory: client.factory });

  assert.deepEqual(result.rows, [{ id: 1 }]);
  assert.deepEqual(client.calls.map(([name]) => name), ["connect", "query", "query", "query", "query", "query", "end"]);
  assert.equal(client.calls[2][1], "SET TRANSACTION READ ONLY");
  assert.equal(client.calls[3][1], "SET LOCAL statement_timeout TO 1000");
  assert.equal(client.calls[4][1].text.includes("LIMIT 11"), true);
});

test("executeReadQuery passes parameters separately from SQL", async () => {
  const client = fakeClient({ rows: [{ id: 1 }] });
  await executeReadQuery(session, "SELECT $1::int AS id", [7], { clientFactory: client.factory });

  const queryCall = client.calls.find(([, query]) => typeof query === "object");
  assert.deepEqual(queryCall[1].values, [7]);
});

test("executeReadQuery sanitizes database errors and still closes the client", async () => {
  const client = fakeClient({ errorOnQuery: "SELECT" });

  await assert.rejects(
    executeReadQuery(session, "SELECT 1", [], { clientFactory: client.factory }),
    (error) => error.message.includes("<redacted>") && !error.message.includes("secret")
  );
  assert.equal(client.calls.at(-1)[0], "end");
});

test("diagnoseSession reports database identity without credentials", async () => {
  const client = fakeClient({ rows: [{ database: "app", user: "agent", version: "PostgreSQL 16" }] });
  const result = await diagnoseSession(session, { clientFactory: client.factory });

  assert.deepEqual(result, { reachable: true, readOnly: true, database: "app", user: "agent", version: "PostgreSQL 16" });
});

test("database error sanitization redacts password assignments", () => {
  assert.equal(sanitizeDatabaseError(new Error("password=other-secret"), session), "password=<redacted>");
});
