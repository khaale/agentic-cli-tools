import test from "node:test";
import assert from "node:assert/strict";
import { normalizeIdentityValue, shortenHash, stableHash } from "../src/hash.js";

test("stableHash is deterministic and shortenHash trims output", () => {
  const hash = stableHash("Alice Example");

  assert.equal(hash, stableHash(" alice   example "));
  assert.match(hash, /^sha256:/);
  assert.equal(shortenHash(hash), hash.slice(0, "sha256:".length + 12));
});

test("normalizeIdentityValue normalizes case and whitespace", () => {
  assert.equal(normalizeIdentityValue("  Alice   Example "), "alice example");
});
