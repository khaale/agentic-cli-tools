import { fail } from "./errors.js";

const ALLOWED_STARTS = new Set(["select", "with", "values", "show", "explain", "table"]);
const FORBIDDEN_WORDS = /\b(insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|copy|vacuum|analyze|call|do|set|reset|discard|begin|commit|rollback|savepoint|release|prepare|execute|listen|notify|unlisten|lock)\b/iu;
const FORBIDDEN_FUNCTIONS = /\b(nextval|setval|pg_terminate_backend|pg_cancel_backend|dblink_exec)\s*\(/iu;

export function assertReadOnlySql(sql) {
  if (typeof sql !== "string" || !sql.trim()) {
    fail("query SQL is required", 2);
  }

  const cleaned = stripSqlCommentsAndLiterals(sql).trim();
  if (!cleaned) {
    fail("query SQL is empty", 2);
  }

  if (cleaned.includes(";")) {
    fail("read-only queries must contain exactly one statement without semicolons", 2);
  }

  const firstWord = cleaned.match(/^([a-z]+)/iu)?.[1]?.toLowerCase();
  if (!ALLOWED_STARTS.has(firstWord)) {
    fail("query is not allowed in read-only mode", 2);
  }

  if (FORBIDDEN_WORDS.test(cleaned) || FORBIDDEN_FUNCTIONS.test(cleaned)) {
    fail("query is not allowed in read-only mode", 2);
  }

  return sql.trim();
}

export function assertParameters(parameters) {
  if (parameters === undefined || parameters === null) {
    return [];
  }

  if (!Array.isArray(parameters)) {
    fail("query parameters must be an array", 2);
  }

  return parameters;
}

export function boundedQueryText(sql, rowLimit) {
  const firstWord = stripSqlCommentsAndLiterals(sql).trim().match(/^([a-z]+)/iu)?.[1]?.toLowerCase();
  if (!["select", "with", "values", "table"].includes(firstWord)) {
    return sql;
  }

  return `SELECT * FROM (${sql}) AS pgc_result LIMIT ${rowLimit + 1}`;
}

export function normalizeQueryResult(result, { rowLimit, byteLimit } = {}) {
  const columns = (result.fields || []).map((field) => ({
    name: field.name,
    typeId: field.dataTypeID ?? null
  }));
  const sourceRows = Array.isArray(result.rows) ? result.rows : [];
  const rows = [];
  let bytes = 0;
  let truncated = sourceRows.length > rowLimit;

  for (const sourceRow of sourceRows.slice(0, rowLimit)) {
    const row = {};
    const names = columns.length > 0 ? columns.map((column) => column.name) : Object.keys(sourceRow);
    for (const name of names) {
      row[name] = normalizeValue(sourceRow[name]);
    }

    const rowBytes = Buffer.byteLength(JSON.stringify(row));
    if (bytes + rowBytes > byteLimit) {
      truncated = true;
      break;
    }

    rows.push(row);
    bytes += rowBytes;
  }

  return {
    columns,
    rows,
    rowCount: rows.length,
    truncated,
    bytes
  };
}

export function normalizeValue(value) {
  if (value === null || value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return { type: "bigint", value: String(value) };
  }

  if (value instanceof Date) {
    return { type: "timestamp", value: value.toISOString() };
  }

  if (Buffer.isBuffer(value)) {
    return { type: "bytea", value: value.toString("base64") };
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, normalizeValue(nested)]));
  }

  return String(value);
}

export function stableStringify(value) {
  return JSON.stringify(normalizeValue(value));
}

function stripSqlCommentsAndLiterals(sql) {
  const output = [];
  let index = 0;
  let state = "code";

  while (index < sql.length) {
    const current = sql[index];
    const next = sql[index + 1];

    if (state === "code" && current === "-" && next === "-") {
      state = "line-comment";
      output.push("  ");
      index += 2;
      continue;
    }

    if (state === "code" && current === "/" && next === "*") {
      state = "block-comment";
      output.push("  ");
      index += 2;
      continue;
    }

    if (state === "code" && current === "'") {
      state = "single-quote";
      output.push(" ");
      index += 1;
      continue;
    }

    if (state === "code" && current === '"') {
      state = "double-quote";
      output.push(" ");
      index += 1;
      continue;
    }

    if (state === "line-comment") {
      if (current === "\n") {
        state = "code";
        output.push("\n");
      } else {
        output.push(" ");
      }
      index += 1;
      continue;
    }

    if (state === "block-comment") {
      if (current === "*" && next === "/") {
        state = "code";
        output.push("  ");
        index += 2;
      } else {
        output.push(current === "\n" ? "\n" : " ");
        index += 1;
      }
      continue;
    }

    if (state === "single-quote") {
      if (current === "'" && next === "'") {
        output.push("  ");
        index += 2;
      } else if (current === "'") {
        state = "code";
        output.push(" ");
        index += 1;
      } else {
        output.push(current === "\n" ? "\n" : " ");
        index += 1;
      }
      continue;
    }

    if (state === "double-quote") {
      if (current === '"' && next === '"') {
        output.push("  ");
        index += 2;
      } else if (current === '"') {
        state = "code";
        output.push(" ");
        index += 1;
      } else {
        output.push(current === "\n" ? "\n" : " ");
        index += 1;
      }
      continue;
    }

    output.push(current);
    index += 1;
  }

  return output.join("");
}
