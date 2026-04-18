import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FileCache } from "../src/cache.js";

test("FileCache stores, lists, and clears entries", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cli-core-cache-"));
  const cache = new FileCache(root);

  await cache.set("projects?page=1", {
    key: "projects?page=1",
    scope: { resource: "projects", group: "platform" },
    storedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    data: [{ id: 1 }]
  });

  assert.deepEqual((await cache.get("projects?page=1")).data, [{ id: 1 }]);
  assert.equal((await cache.list()).length, 1);
  assert.equal((await cache.clear({ group: "platform" })).length, 1);
});
