export { pickFields } from "@khaale/cli-core";
import { shortenHash } from "@khaale/cli-core";
import { anonymizeForOutput } from "./anonymize.js";

export function resolveOutputMode(_kind, options) {
  if (_kind === "raw") {
    return "raw";
  }

  if (_kind === "config") {
    return "json";
  }

  if (options.json) {
    return "json";
  }

  if (options.md) {
    return "md";
  }

  return "md";
}

export function writeOutput(value, mode, { compact = false } = {}) {
  const sanitized = anonymizeForOutput(value);

  switch (mode) {
    case "raw":
      process.stdout.write(String(value));
      if (!String(value).endsWith("\n")) {
        process.stdout.write("\n");
      }
      break;
    case "md":
      process.stdout.write(`${renderMarkdown(sanitized)}\n`);
      break;
    default:
      process.stdout.write(`${JSON.stringify(sanitized, null, compact ? 0 : 2)}\n`);
      break;
  }
}

export function renderMarkdown(value) {
  const sanitized = anonymizeForOutput(value);

  if (Array.isArray(sanitized) && sanitized.every(isTaskLike)) {
    return renderTaskListMarkdown(sanitized);
  }

  if (isTaskLike(sanitized)) {
    return renderTaskMarkdown(sanitized);
  }

  if (Array.isArray(sanitized)) {
    return renderGenericListMarkdown(sanitized);
  }

  return renderGenericObjectMarkdown(sanitized);
}

function renderTaskListMarkdown(tasks) {
  const lines = [`# Tasks (${tasks.length})`];

  if (tasks.length === 0) {
    return lines.join("\n");
  }

  for (const task of tasks) {
    lines.push("");
    lines.push(`## ${task.id} - ${task.title || "(untitled)"}`);
    lines.push(...renderTaskFacts(task));
  }

  return lines.join("\n");
}

function renderTaskMarkdown(task) {
  const lines = [`# Task ${task.id} - ${task.title || "(untitled)"}`, ""];
  lines.push(...renderTaskFacts(task));
  lines.push(...renderTaskRelations(task));

  if (task.description) {
    lines.push("");
    lines.push("## Description");
    lines.push("");
    lines.push(String(task.description).trim());
  }

  return lines.join("\n");
}

function renderTaskFacts(task) {
  const lines = [];
  const facts = [
    ["Status", task.status],
    ["Archived", formatBoolean(task.archived)],
    ["Assignee", formatUser(task.assignee)],
    ["Parents", formatRelationCount(task.parents_count)],
    ["Children", formatChildrenCount(task.children_count, task.children_done)],
    ["Space", formatEntity(task.space)],
    ["Board", formatEntity(task.board)],
    ["Column", formatColumn(task.column)],
    ["Type", task.type?.name || null],
    ["Created", task.created_at],
    ["Updated", task.updated_at],
    ["Completed", task.completed_at],
    ["Moved", task.last_moved_at],
    ["URL", task.url]
  ];

  for (const [label, value] of facts) {
    if (value === null || value === undefined || value === "") {
      continue;
    }
    lines.push(`- ${label}: ${value}`);
  }

  return lines;
}

function renderTaskRelations(task) {
  const lines = [];

  if (Array.isArray(task.parents) && task.parents.length > 0) {
    lines.push("");
    lines.push("## Parents");
    lines.push("");
    lines.push(...task.parents.map((item) => `- ${formatRelatedTask(item)}`));
  }

  if (Array.isArray(task.children) && task.children.length > 0) {
    lines.push("");
    lines.push("## Children");
    lines.push("");
    lines.push(...task.children.map((item) => `- ${formatRelatedTask(item)}`));
  }

  return lines;
}

function renderGenericListMarkdown(items) {
  const lines = [`# Items (${items.length})`];

  for (const item of items) {
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(item, null, 2));
    lines.push("```");
  }

  return lines.join("\n");
}

function renderGenericObjectMarkdown(value) {
  return ["```json", JSON.stringify(value, null, 2), "```"].join("\n");
}

function isTaskLike(value) {
  return Boolean(value && typeof value === "object" && "id" in value && "title" in value);
}

function formatBoolean(value) {
  return value ? "yes" : "no";
}

function formatUser(user) {
  if (!user) {
    return null;
  }

  return user.hash ? shortenHash(user.hash) : null;
}

function formatEntity(entity) {
  if (!entity) {
    return null;
  }

  const name = entity.title || entity.uid || entity.id;
  if (entity.id === undefined || entity.id === null) {
    return String(name);
  }

  return `${name} (${entity.id})`;
}

function formatColumn(column) {
  if (!column) {
    return null;
  }

  const bits = [column.title || column.id];
  if (column.type !== undefined && column.type !== null) {
    bits.push(`type ${column.type}`);
  }

  return bits.join(", ");
}

function formatRelatedTask(task) {
  const bits = [`#${task.id ?? "?"}`];

  if (task.title) {
    bits.push(task.title);
  }

  if (task.status) {
    bits.push(`[${task.status}]`);
  }

  const assignee = formatUser(task.assignee);
  if (assignee) {
    bits.push(`assignee=${assignee}`);
  }

  return bits.join(" ");
}

function formatRelationCount(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
}

function formatChildrenCount(total, done) {
  if (total === null || total === undefined) {
    return null;
  }

  if (done === null || done === undefined) {
    return String(total);
  }

  return `${total} (${done} done)`;
}
