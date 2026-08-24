import { createCliArgParser } from "@khaale/cli-core";
import { CliError } from "./lib/errors.js";
import { loadConfig } from "./lib/config.js";
import { resolveFormat, writeOutput } from "./lib/output.js";
import { executeReadQuery, diagnoseSession } from "./lib/postgres.js";
import { compareQueries } from "./lib/compare.js";
import { relationships, schemaOverview, schemaSearch, tableDetail } from "./lib/schema.js";

const parseArgs = createCliArgParser({
  booleanFlags: ["json", "md", "csv", "compact", "force", "help"]
});

export async function main(argv, dependencies = {}) {
  const result = await run(argv, dependencies);
  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}

export async function run(argv, dependencies = {}) {
  const stdout = dependencies.stdout || process.stdout;
  const stderr = dependencies.stderr || process.stderr;
  const wantsJson = !argv.includes("--md") && !argv.includes("--csv");

  try {
    const parsed = parseArgs(argv);
    if (parsed.options.help || argv.length === 0) {
      stdout.write(`${HELP_TEXT}\n`);
      return { exitCode: 0 };
    }
    const data = await dispatch(parsed, dependencies);
    writeOutput(data, resolveFormat(parsed.options), {
      compact: parsed.options.compact,
      fields: parseCsv(parsed.options.fields),
      stdout
    });
    return { exitCode: 0, data };
  } catch (error) {
    const normalized = normalizeError(error);
    if (wantsJson) {
      writeError(stdout, normalized);
    } else {
      stderr.write(`${normalized.message}\n`);
    }

    return { exitCode: normalized.exitCode, error: normalized };
  }
}

async function dispatch(parsed, dependencies) {
  const { resource, verb, options } = parsed;
  const config = await loadConfig(dependencies);

  if (resource === "doctor") {
    const base = { ok: true, tool: "pgc", config: config.safeView() };
    if (!options.session) {
      return base;
    }

    const session = config.getSession(options.session);
    return { ...base, session: session.name, diagnosis: await diagnoseSession(session, dependencies) };
  }

  if (resource === "sessions" && verb === "list") {
    return { ok: true, sessions: config.listSessions() };
  }

  if (resource === "config" && verb === "path") {
    return { ok: true, path: config.path };
  }

  if (resource === "config" && verb === "get") {
    return { ok: true, ...config.safeView() };
  }

  if (resource === "config" && verb === "init") {
    return config.init({ force: options.force });
  }

  if (resource === "query") {
    const session = config.getSession(options.session);
    const result = await executeReadQuery(
      session,
      options.sql,
      parseJsonArray(options.params, "query parameters"),
      { ...dependencies, ...options }
    );
    return { ok: true, kind: "query", session: session.name, ...result };
  }

  if (resource === "schema") {
    if (verb === "overview") {
      return schemaOverview(config, { ...options, ...dependencies });
    }

    if (verb === "search") {
      return schemaSearch(config, { ...options, ...dependencies });
    }

    if (verb === "table") {
      return tableDetail(config, { ...options, ...dependencies });
    }

    if (verb === "relations") {
      const result = await relationships(config, { ...options, ...dependencies });
      return { ok: true, kind: "schema-relations", session: options.session, table: { schema: options.schema, name: options.table }, ...result };
    }
  }

  if (resource === "compare") {
    return compareQueries(config, { ...options, ...dependencies });
  }

  throw new CliError(`unsupported command: ${[resource, verb].filter(Boolean).join(" ") || "(empty)"}`, 2);
}

function parseCsv(value) {
  if (!value) {
    return null;
  }

  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function normalizeError(error) {
  if (error instanceof CliError) {
    return { message: error.message, exitCode: error.exitCode, code: error.code || "cli_error" };
  }

  return { message: error?.message || String(error), exitCode: 1, code: "internal_error" };
}

function parseJsonArray(value, label) {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      throw new Error("expected an array");
    }
    return parsed;
  } catch {
    throw new CliError(`${label} must be a JSON array`, 2);
  }
}

function writeError(stdout, error) {
  stdout.write(`${JSON.stringify({
    ok: false,
    error: {
      code: error.code,
      message: error.message
    }
  }, null, 2)}\n`);
}

const HELP_TEXT = `pgc - read-only PostgreSQL explorer for agents

Commands:
  pgc --json doctor [--session NAME]
  pgc --json sessions list
  pgc --json schema overview --session NAME
  pgc --json schema search --session NAME --query TEXT [--type TYPE] [--schema NAME]
  pgc --json schema table --session NAME --schema NAME --table NAME
  pgc --json schema relations --session NAME --schema NAME --table NAME [--direction incoming|outgoing|both]
  pgc --json query --session NAME --sql SQL [--params JSON_ARRAY]
  pgc --json compare --left-session NAME --right-session NAME --left-query SQL --right-query SQL --key COLUMN[,COLUMN]

Output is JSON by default. Use --md for human-readable output or --csv for tabular query results.`;
