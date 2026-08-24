import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { run } from "../src/cli.js";
import { captureStream, createConfigFile, fakeClient } from "./support.js";

test("CLI lists named sessions in a stable JSON envelope", async () => {
  const { configPath } = await createConfigFile({
    sessions: { qa: { host: "qa.example", database: "app", user: "agent", password: "secret" } }
  });
  const stdout = captureStream();
  const result = await run(["--json", "sessions", "list"], { configPath, stdout });
  const payload = JSON.parse(stdout.value);

  assert.equal(result.exitCode, 0);
  assert.equal(payload.ok, true);
  assert.equal(payload.sessions[0].name, "qa");
  assert.equal(stdout.value.includes('"password"'), false);
  assert.equal(stdout.value.includes('"secret":"secret"'), false);
});

test("CLI returns a JSON error for unsupported commands", async () => {
  const stdout = captureStream();
  const result = await run(["--json", "unknown"], { stdout });
  const payload = JSON.parse(stdout.value);

  assert.equal(result.exitCode, 2);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "cli_error");
});

test("query reads UTF-8 SQL files and applies a command-line row limit", async () => {
  const { directory, configPath } = await createConfigFile({
    sessions: {
      qa: { host: "127.0.0.1", database: "app", user: "agent", password: "secret" }
    },
    defaults: { statementTimeoutMs: 1234, rowLimit: 1000, byteLimit: 5 }
  });
  const sqlPath = path.join(directory, "query.sql");
  await fs.writeFile(sqlPath, "\ufeffSELECT привет FROM public.orders", "utf8");
  const stdout = captureStream();
  const client = fakeClient({ rows: [{ id: 1 }, { id: 2 }] });

  const result = await run(
    ["--json", "query", "--session", "qa", "--sql-file", sqlPath, "--row-limit", "5000"],
    { configPath, stdout, clientFactory: client.factory }
  );

  const payload = JSON.parse(stdout.value);
  const queryCall = client.calls.find(([, query]) => typeof query === "object" && query?.text?.includes("pgc_result"));
  const timeoutCall = client.calls.find(([, query]) => typeof query === "string" && query.startsWith("SET LOCAL statement_timeout"));

  assert.equal(result.exitCode, 0);
  assert.equal(payload.ok, true);
  assert.match(queryCall[1].text, /SELECT привет FROM public\.orders/);
  assert.match(queryCall[1].text, /LIMIT 5001/);
  assert.equal(timeoutCall[1], "SET LOCAL statement_timeout TO 1234");
  assert.equal(payload.truncated, true);
});

test("query rejects invalid SQL sources and row limits before connecting", async () => {
  const { configPath } = await createConfigFile({
    sessions: {
      qa: { host: "127.0.0.1", database: "app", user: "agent", password: "secret" }
    }
  });

  for (const args of [
    ["--json", "query", "--session", "qa"],
    ["--json", "query", "--session", "qa", "--sql", "SELECT 1", "--sql-file", "missing.sql"],
    ["--json", "query", "--session", "qa", "--sql-file", "missing.sql"],
    ["--json", "query", "--session", "qa", "--sql", "SELECT 1", "--row-limit", "0"]
  ]) {
    const stdout = captureStream();
    let connected = false;
    const result = await run(args, {
      configPath,
      stdout,
      clientFactory: () => {
        connected = true;
        throw new Error("should not connect");
      }
    });
    const payload = JSON.parse(stdout.value);

    assert.equal(result.exitCode, 2);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "cli_error");
    assert.equal(connected, false);
  }
});
