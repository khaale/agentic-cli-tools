import test from "node:test";
import assert from "node:assert/strict";
import { anonymizeUser, normalizeIdentityValue, shortenHash, stableHash } from "../src/lib/anonymize.js";

test("normalizeIdentityValue collapses case and whitespace", () => {
  assert.equal(normalizeIdentityValue("  ИМЯ   Фамилия "), "имя фамилия");
});

test("anonymizeUser produces the same hash for the same written full name", () => {
  const left = anonymizeUser({ full_name: "Имя Фамилия" });
  const right = anonymizeUser({ full_name: "  имя   фамилия " });

  assert.equal(left.hash, right.hash);
  assert.equal(left.hash_source, "full_name");
  assert.match(left.hash, /^sha256:[a-f0-9]{64}$/);
});

test("stableHash is idempotent for already hashed values", () => {
  const value = stableHash("Alice Example");
  assert.equal(stableHash(value), value);
});

test("shortenHash keeps the prefix and truncates the digest", () => {
  const value = stableHash("Alice Example");
  assert.equal(shortenHash(value), `sha256:${value.slice("sha256:".length, "sha256:".length + 12)}`);
});
