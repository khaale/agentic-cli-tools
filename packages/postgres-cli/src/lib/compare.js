import { CliError } from "./errors.js";
import { stableStringify } from "./query.js";
import { executeReadQuery } from "./postgres.js";

export async function compareQueries(config, options = {}) {
  const leftSession = config.getSession(options.leftSession);
  const rightSession = config.getSession(options.rightSession);
  if (leftSession.name === rightSession.name) {
    throw new CliError("comparison requires two distinct PostgreSQL sessions", 2);
  }

  const keyColumns = normalizeKeys(options.key);
  if (keyColumns.length === 0) {
    throw new CliError("comparison requires at least one key column", 2);
  }

  const execute = options.execute || executeReadQuery;
  const [left, right] = await Promise.all([
    runSide(execute, leftSession, options.leftQuery, options),
    runSide(execute, rightSession, options.rightQuery, options)
  ]);

  if (left.status !== "ok" || right.status !== "ok") {
    return {
      ok: true,
      kind: "data-comparison",
      complete: false,
      equal: false,
      left: sourceStatus(leftSession, left),
      right: sourceStatus(rightSession, right),
      differences: []
    };
  }

  const comparison = compareResults(left.result, right.result, keyColumns);
  return {
    ok: true,
    kind: "data-comparison",
    ...comparison,
    left: sourceStatus(leftSession, left),
    right: sourceStatus(rightSession, right)
  };
}

export function compareResults(left, right, keyColumns) {
  const leftColumns = columnNames(left);
  const rightColumns = columnNames(right);
  const missingKeys = keyColumns.filter((key) => !leftColumns.includes(key) || !rightColumns.includes(key));
  if (missingKeys.length > 0) {
    throw new CliError(`comparison key columns are missing: ${missingKeys.join(", ")}`, 2);
  }

  if (leftColumns.length !== rightColumns.length || [...leftColumns].sort().join("\u0000") !== [...rightColumns].sort().join("\u0000")) {
    throw new CliError("comparison query results must expose the same column names", 2);
  }

  const leftIndex = indexRows(left.rows || [], keyColumns, "left");
  const rightIndex = indexRows(right.rows || [], keyColumns, "right");
  const keys = [...new Set([...leftIndex.keys(), ...rightIndex.keys()])].sort();
  const differences = [];
  let equalCount = 0;

  for (const key of keys) {
    const leftRow = leftIndex.get(key);
    const rightRow = rightIndex.get(key);
    if (!leftRow) {
      differences.push({ kind: "right-only", key: keyValue(rightRow, keyColumns), right: rightRow });
      continue;
    }

    if (!rightRow) {
      differences.push({ kind: "left-only", key: keyValue(leftRow, keyColumns), left: leftRow });
      continue;
    }

    const changed = {};
    for (const column of leftColumns) {
      if (keyColumns.includes(column)) {
        continue;
      }

      if (stableStringify(leftRow[column]) !== stableStringify(rightRow[column])) {
        changed[column] = { left: leftRow[column], right: rightRow[column] };
      }
    }

    if (Object.keys(changed).length === 0) {
      equalCount += 1;
    } else {
      differences.push({ kind: "changed", key: keyValue(leftRow, keyColumns), changed });
    }
  }

  const complete = !left.truncated && !right.truncated;
  return {
    complete,
    equal: complete && differences.length === 0,
    counts: {
      equal: equalCount,
      changed: differences.filter((item) => item.kind === "changed").length,
      leftOnly: differences.filter((item) => item.kind === "left-only").length,
      rightOnly: differences.filter((item) => item.kind === "right-only").length
    },
    keyColumns,
    columns: leftColumns,
    differences
  };
}

function normalizeKeys(keys) {
  if (Array.isArray(keys)) {
    return keys.map((key) => String(key).trim()).filter(Boolean);
  }

  return String(keys || "").split(",").map((key) => key.trim()).filter(Boolean);
}

async function runSide(execute, session, sql, options) {
  try {
    if (!sql) {
      throw new CliError(`${session.name} comparison query is required`, 2);
    }
    return { status: "ok", result: await execute(session, sql, parseParameters(options, session), options) };
  } catch (error) {
    return { status: "error", error: { code: error.code || "query_error", message: error.message } };
  }
}

function parseParameters(options, session) {
  const value = options[session.name === options.leftSession ? "leftParams" : "rightParams"];
  if (value === undefined || value === null || Array.isArray(value)) {
    return value || [];
  }

  try {
    return JSON.parse(value);
  } catch {
    throw new CliError("query parameters must be a JSON array", 2);
  }
}

function sourceStatus(session, side) {
  return {
    session: session.name,
    status: side.status,
    ...(side.result ? { truncated: side.result.truncated, rowCount: side.result.rowCount } : {}),
    ...(side.error ? { error: side.error } : {})
  };
}

function columnNames(result) {
  return (result.columns || []).map((column) => typeof column === "string" ? column : column.name);
}

function indexRows(rows, keyColumns, side) {
  const index = new Map();
  for (const row of rows) {
    const key = stableStringify(keyColumns.map((column) => row[column]));
    if (index.has(key)) {
      throw new CliError(`duplicate comparison key in ${side} query result`, 2);
    }
    index.set(key, row);
  }
  return index;
}

function keyValue(row, keyColumns) {
  return Object.fromEntries(keyColumns.map((column) => [column, row[column]]));
}
