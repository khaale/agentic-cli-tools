import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/lib/config.js";
import { createConfigFile } from "./support.js";

test("loadConfig resolves named sessions and redacts secrets from safe views", async () => {
  const { configPath } = await createConfigFile({
    sessions: {
      qa: { host: "qa.example", port: 5433, database: "app", user: "agent", password: "secret" },
      uat: { host: "uat.example", database: "app", user: "agent", passwordEnv: "PGC_UAT_PASSWORD" }
    },
    defaults: { rowLimit: 25 }
  });

  const config = await loadConfig({ configPath, env: { PGC_UAT_PASSWORD: "uat-secret" } });
  assert.deepEqual(config.listSessions().map((session) => session.name), ["qa", "uat"]);
  assert.equal(config.listSessions()[0].secret, "configured");
  assert.equal(config.safeView().sessions[0].password, undefined);
  assert.equal(config.getSession("qa").password, "secret");
  assert.equal(config.getSession("uat").password, "uat-secret");
  assert.equal(config.getSession("qa").rowLimit, 25);
});

test("loadConfig rejects a missing named session or secret reference", async () => {
  const { configPath } = await createConfigFile({
    sessions: { qa: { host: "qa.example", database: "app", user: "agent", passwordEnv: "MISSING" } }
  });
  const config = await loadConfig({ configPath, env: {} });

  assert.throws(() => config.getSession("uat"), /unknown PostgreSQL session/);
  assert.throws(() => config.getSession("qa"), /missing secret/);
});
