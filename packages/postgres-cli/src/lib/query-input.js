import { fail } from "./errors.js";

export async function resolveQueryInput(options, fsImpl) {
  const hasInlineSql = options.sql !== undefined;
  const hasSqlFile = options.sqlFile !== undefined;

  if (hasInlineSql === hasSqlFile) {
    fail("query requires exactly one of --sql or --sql-file", 2);
  }

  if (hasInlineSql) {
    return options.sql;
  }

  try {
    const sql = await fsImpl.readFile(options.sqlFile, "utf8");
    return sql.charCodeAt(0) === 0xfeff ? sql.slice(1) : sql;
  } catch (error) {
    fail(`unable to read SQL file: ${options.sqlFile}`, 2);
  }
}

export function parseRowLimit(value) {
  if (value === undefined) {
    return undefined;
  }

  const rowLimit = Number(value);
  if (!Number.isInteger(rowLimit) || rowLimit <= 0) {
    fail("--row-limit must be a positive integer", 2);
  }

  return rowLimit;
}
