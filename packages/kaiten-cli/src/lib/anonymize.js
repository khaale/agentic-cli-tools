export {
  normalizeIdentityValue,
  shortenHash,
  stableHash
} from "@khaale/cli-core";
import { normalizeIdentityValue, stableHash } from "@khaale/cli-core";

const SENSITIVE_SCALAR_KEYS = new Set([
  "assignee_id",
  "owner_id",
  "updater_id",
  "blocker_id"
]);

const USER_OBJECT_KEYS = new Set([
  "assignee",
  "owner",
  "user",
  "users",
  "member",
  "members",
  "blocker",
  "updater"
]);

const USER_IDENTITY_KEYS = ["full_name", "name", "email", "username", "uid", "id"];
export function anonymizeForOutput(value, contextKey = null) {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => anonymizeForOutput(item, contextKey));
  }

  if (typeof value !== "object") {
    if (SENSITIVE_SCALAR_KEYS.has(contextKey)) {
      return stableHash(value);
    }

    return value;
  }

  if (isAnonymizedUser(value)) {
    return value;
  }

  if (isUserLike(value, contextKey)) {
    return anonymizeUser(value);
  }

  const next = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    next[key] = anonymizeForOutput(nestedValue, key);
  }
  return next;
}

export function anonymizeUser(user) {
  if (!user) {
    return null;
  }

  const hashes = {};

  for (const key of USER_IDENTITY_KEYS) {
    const raw = user[key];
    if (raw === null || raw === undefined || raw === "") {
      continue;
    }

    hashes[key] = stableHash(raw);
  }

  const preferredSource = selectPreferredSource(hashes);
  return {
    hash: preferredSource ? hashes[preferredSource] : null,
    hash_source: preferredSource,
    hashes
  };
}

function isUserLike(value, contextKey) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const hasExplicitUserFields = ["full_name", "name", "email", "username"].some((key) => {
    const candidate = value[key];
    return candidate !== undefined && candidate !== null && candidate !== "";
  });

  if (hasExplicitUserFields) {
    return true;
  }

  if (!USER_OBJECT_KEYS.has(contextKey)) {
    return false;
  }

  return USER_IDENTITY_KEYS.some((key) => {
    const candidate = value[key];
    return candidate !== undefined && candidate !== null && candidate !== "";
  });
}

function isAnonymizedUser(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    "hash" in value &&
    "hash_source" in value &&
    "hashes" in value
  );
}

function selectPreferredSource(hashes) {
  for (const key of USER_IDENTITY_KEYS) {
    if (hashes[key]) {
      return key;
    }
  }

  return null;
}
