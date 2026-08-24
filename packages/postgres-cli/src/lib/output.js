import { pickFields } from "@khaale/cli-core";

export function resolveFormat(options = {}) {
  if (options.csv) {
    return "csv";
  }

  if (options.md) {
    return "md";
  }

  return "json";
}

export function writeOutput(value, format, { compact = false, fields, stdout = process.stdout } = {}) {
  const projected = fields ? pickFields(value, fields) : value;

  if (format === "csv") {
    stdout.write(`${renderCsv(projected)}\n`);
    return;
  }

  if (format === "md") {
    stdout.write(`${renderMarkdown(projected)}\n`);
    return;
  }

  stdout.write(`${JSON.stringify(projected, null, compact ? 0 : 2)}\n`);
}

export function renderCsv(value) {
  const rows = Array.isArray(value?.rows) ? value.rows : Array.isArray(value) ? value : null;
  const columns = Array.isArray(value?.columns)
    ? value.columns.map((column) => typeof column === "string" ? column : column.name)
    : rows && rows.length > 0
      ? Object.keys(rows[0])
      : [];

  if (!rows || columns.length === 0) {
    throw new Error("CSV output is supported only for tabular query results");
  }

  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row?.[column])).join(","));
  }

  return lines.join("\n");
}

export function renderMarkdown(value) {
  if (Array.isArray(value)) {
    return renderMarkdownTable(value);
  }

  if (Array.isArray(value?.rows)) {
    const table = renderMarkdownTable(value.rows, value.columns);
    const status = value.truncated ? "\n\n> Result truncated by pgc limits." : "";
    return `${table}${status}`;
  }

  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

function renderMarkdownTable(rows, declaredColumns) {
  const columns = Array.isArray(declaredColumns)
    ? declaredColumns.map((column) => typeof column === "string" ? column : column.name)
    : rows.length > 0
      ? Object.keys(rows[0])
      : [];

  if (columns.length === 0) {
    return "(empty)";
  }

  const header = `| ${columns.join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map((column) => markdownCell(row?.[column])).join(" | ")} |`);
  return [header, separator, ...body].join("\n");
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function markdownCell(value) {
  return csvCell(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}
