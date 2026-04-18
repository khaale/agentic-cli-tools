import crypto from "node:crypto";

const SHORT_HASH_HEX_LENGTH = 12;

export function stableHash(value) {
  const text = String(value);
  if (text.startsWith("sha256:")) {
    return text;
  }

  const normalized = normalizeIdentityValue(text);
  const digest = crypto.createHash("sha256").update(normalized).digest("hex");
  return `sha256:${digest}`;
}

export function shortenHash(value, hexLength = SHORT_HASH_HEX_LENGTH) {
  const text = String(value || "");
  if (!text.startsWith("sha256:")) {
    return text;
  }

  const hex = text.slice("sha256:".length);
  if (hex.length <= hexLength) {
    return text;
  }

  return `sha256:${hex.slice(0, hexLength)}`;
}

export function normalizeIdentityValue(value) {
  return String(value)
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}
