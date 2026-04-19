import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDateSpec } from "../src/date.js";

test("parseDateSpec: ISO8601", () => {
  const input = "2023-10-27T10:00:00Z";
  const result = parseDateSpec(input);
  assert.strictEqual(result.toISOString().replace(".000", ""), input);
});

test("parseDateSpec: relative durations", () => {
  const now = Date.now();
  
  // Hours
  const h = parseDateSpec("1h");
  assert.ok(now - h.getTime() >= 60 * 60 * 1000);
  
  // Days
  const d = parseDateSpec("1d");
  assert.ok(now - d.getTime() >= 24 * 60 * 60 * 1000);
  
  // Weeks
  const w = parseDateSpec("1w");
  assert.ok(now - w.getTime() >= 7 * 24 * 60 * 60 * 1000);
});

test("parseDateSpec: months and years (approximate check)", () => {
  const now = new Date();
  
  const m = parseDateSpec("1m");
  assert.strictEqual(m.getMonth(), (now.getMonth() - 1 + 12) % 12);
  
  const y = parseDateSpec("1y");
  assert.strictEqual(y.getFullYear(), now.getFullYear() - 1);
});

test("parseDateSpec: invalid input", () => {
  assert.throws(() => parseDateSpec("invalid"), /invalid date specification/);
  assert.throws(() => parseDateSpec("10x"), /invalid date specification/);
});
