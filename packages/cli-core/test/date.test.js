import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDateSpec } from "../src/date.js";

test("parseDateSpec: ISO8601", () => {
  const input = "2023-10-27T10:00:00Z";
  const result = parseDateSpec(input);
  assert.strictEqual(result.toISOString().replace(".000", ""), input);
});

test("parseDateSpec: relative durations", () => {
  const assertCloseToExpected = (input, adjust) => {
    const result = parseDateSpec(input);
    const expected = new Date();
    adjust(expected);

    assert.ok(
      Math.abs(result.getTime() - expected.getTime()) < 1000,
      `${input} should resolve close to the expected relative date`
    );
  };

  // Hours
  assertCloseToExpected("1h", (date) => date.setHours(date.getHours() - 1));

  // Days
  assertCloseToExpected("1d", (date) => date.setDate(date.getDate() - 1));

  // Weeks
  assertCloseToExpected("1w", (date) => date.setDate(date.getDate() - 7));
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
