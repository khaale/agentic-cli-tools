import { shortenHash, stableHash } from "@khaale/cli-core";

const HASHED_STRING_KEYS = new Set([
  "username",
  "name",
  "author_name"
]);
const MENTION_TEXT_KEYS = new Set([
  "body"
]);

export function anonymizeForOutput(value, contextKey = null) {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => anonymizeForOutput(item, contextKey));
  }

  if (typeof value !== "object") {
    if (HASHED_STRING_KEYS.has(contextKey)) {
      return anonymizeIdentity(value);
    }

    if (MENTION_TEXT_KEYS.has(contextKey)) {
      return anonymizeMentions(value);
    }

    return value;
  }

  const next = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    next[key] = anonymizeForOutput(nestedValue, key);
  }
  return next;
}

export function anonymizeIdentity(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return shortenHash(stableHash(value));
}

export function anonymizeMentions(value) {
  const text = String(value);
  return text.replace(/(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_][a-zA-Z0-9_.-]*)/g, (match, prefix, username) => {
    const trimmed = username.replace(/[.,!?;:]+$/g, "");
    const suffix = username.slice(trimmed.length);
    const hashed = anonymizeIdentity(trimmed);
    return `${prefix}@${hashed}${suffix}`;
  });
}
