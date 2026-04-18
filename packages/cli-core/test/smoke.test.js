import test from "node:test";
import assert from "node:assert/strict";

test("cli-core placeholder loads", async () => {
  const mod = await import("../src/index.js");
  assert.equal(typeof mod, "object");
});
