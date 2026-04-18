export { pickFields } from "@khaale/cli-core";
import { anonymizeForOutput } from "./anonymize.js";

export function resolveOutputMode(kind, options) {
  if (kind === "raw") {
    return "raw";
  }

  if (options.jsonl) {
    return "jsonl";
  }

  if (options.json) {
    return "json";
  }

  if (kind === "list") {
    return "jsonl";
  }

  if (kind === "tree") {
    return "tree";
  }

  return "json";
}

export function writeOutput(value, mode, { compact = false } = {}) {
  const sanitized = anonymizeForOutput(value);

  switch (mode) {
    case "raw":
      process.stdout.write(String(sanitized));
      if (!String(sanitized).endsWith("\n")) {
        process.stdout.write("\n");
      }
      break;
    case "lines":
      for (const item of sanitized) {
        process.stdout.write(formatRawLine(item));
        process.stdout.write("\n");
      }
      break;
    case "jsonl":
      for (const item of sanitized) {
        process.stdout.write(`${JSON.stringify(item)}\n`);
      }
      break;
    case "tree":
      process.stdout.write(`${renderTree(sanitized)}\n`);
      break;
    default:
      process.stdout.write(`${JSON.stringify(sanitized, null, compact ? 0 : 2)}\n`);
      break;
  }
}

export function renderTree(node) {
  const lines = [];
  lines.push(node.label);
  walk(node.children || [], "", lines);
  return lines.join("\n");
}

function formatRawLine(value) {
  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return String(value);
  }

  return JSON.stringify(value);
}

function walk(children, prefix, lines) {
  children.forEach((child, index) => {
    const isLast = index === children.length - 1;
    lines.push(`${prefix}${isLast ? "└─ " : "├─ "}${child.label}`);
    if (child.children && child.children.length > 0) {
      walk(child.children, `${prefix}${isLast ? "   " : "│  "}`, lines);
    }
  });
}
