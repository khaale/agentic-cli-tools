import test from "node:test";
import assert from "node:assert/strict";
import { anonymizeForOutput, anonymizeIdentity, anonymizeMentions } from "../src/lib/anonymize.js";

test("anonymizeForOutput hashes username and name fields inside nested GitLab objects", () => {
  const value = anonymizeForOutput({
    author: {
      id: 338,
      username: "aleks",
      name: "Aleksander Khanteev"
    }
  });

  assert.equal(value.author.id, 338);
  assert.match(value.author.username, /^sha256:[a-f0-9]{12}$/);
  assert.match(value.author.name, /^sha256:[a-f0-9]{12}$/);
  assert.notEqual(value.author.username, "aleks");
  assert.notEqual(value.author.name, "Aleksander Khanteev");
});

test("anonymizeIdentity hashes compact identity fields", () => {
  assert.match(anonymizeIdentity("aleks"), /^sha256:[a-f0-9]{12}$/);
  assert.equal(anonymizeIdentity(null), null);
});

test("anonymizeMentions rewrites usernames inside discussion text", () => {
  const value = anonymizeMentions("requested review from @aleks and @qa-team");
  assert.match(value, /requested review from @sha256:[a-f0-9]{12} and @sha256:[a-f0-9]{12}/);
  assert.doesNotMatch(value, /@aleks|@qa-team/);
});

test("anonymizeForOutput rewrites @mentions in note bodies", () => {
  const value = anonymizeForOutput({
    body: "requested review from @aleks"
  });

  assert.match(value.body, /requested review from @sha256:[a-f0-9]{12}/);
  assert.doesNotMatch(value.body, /@aleks/);
});
