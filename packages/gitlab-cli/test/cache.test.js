import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FileCache } from "../src/lib/cache.js";

test("FileCache stores and retrieves entries", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glc-cache-test-"));
  const cache = new FileCache(root);

  await cache.set("projects?page=1", {
    key: "projects?page=1",
    scope: { resource: "projects", group: "platform" },
    storedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    data: [{ id: 1 }]
  });

  const entry = await cache.get("projects?page=1");
  assert.deepEqual(entry.data, [{ id: 1 }]);
});

test("FileCache ignores expired entries", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glc-cache-test-"));
  const cache = new FileCache(root);

  await cache.set("projects?page=2", {
    key: "projects?page=2",
    scope: { resource: "projects", group: "platform" },
    storedAt: Date.now() - 120_000,
    expiresAt: Date.now() - 60_000,
    data: [{ id: 2 }]
  });

  const entry = await cache.get("projects?page=2");
  assert.equal(entry, null);
});

test("FileCache lists and clears scoped entries", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glc-cache-test-"));
  const cache = new FileCache(root);

  await cache.set("projects?page=1", {
    key: "projects?page=1",
    scope: { resource: "projects", group: "platform" },
    storedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    data: [{ id: 1 }]
  });

  await cache.set("pipelines?page=1", {
    key: "pipelines?page=1",
    scope: { resource: "pipelines", project: "platform/api" },
    storedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    data: [{ id: 3 }]
  });

  const entries = await cache.list();
  assert.equal(entries.length, 2);

  const removed = await cache.clear({ group: "platform" });
  assert.equal(removed.length, 1);

  const remaining = await cache.list();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].scope.project, "platform/api");
});
