import { fail } from "./errors.js";

export function createCliArgParser({ booleanFlags = [], removedFlags = [] } = {}) {
  const knownBooleanFlags = new Set(booleanFlags);
  const knownRemovedFlags = new Set(removedFlags);

  return function parseCliArgs(argv) {
    const positionals = [];
    const options = {};

    for (let index = 0; index < argv.length; index += 1) {
      const token = argv[index];

      if (!token.startsWith("--")) {
        positionals.push(token);
        continue;
      }

      const body = token.slice(2);
      const eqIndex = body.indexOf("=");
      const key = normalizeOption(eqIndex >= 0 ? body.slice(0, eqIndex) : body);

      if (knownRemovedFlags.has(key)) {
        fail(`--${body} is no longer supported`, 2);
      }

      if (knownBooleanFlags.has(key)) {
        options[key] = true;
        continue;
      }

      if (eqIndex >= 0) {
        options[key] = body.slice(eqIndex + 1);
        continue;
      }

      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        fail(`missing value for option: --${body}`, 2);
      }

      options[key] = next;
      index += 1;
    }

    const [resource, verb, ...rest] = positionals;
    return { resource, verb, positionals: rest, options };
  };
}

export function normalizeOption(name) {
  return name.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

export function numberOption(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    fail(`expected a number, got: ${value}`, 2);
  }

  return parsed;
}

export function csvOption(value) {
  if (!value) {
    return null;
  }

  return value
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
}
