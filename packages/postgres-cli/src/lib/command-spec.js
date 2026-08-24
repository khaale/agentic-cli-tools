import {
  command,
  extendType,
  flag,
  oneOf,
  option,
  optional,
  string,
  subcommands
} from "cmd-ts";
import { compareQueries } from "./compare.js";
import { loadConfig } from "./config.js";
import { CliError } from "./errors.js";
import { diagnoseSession, executeReadQuery } from "./postgres.js";
import { parseRowLimit, resolveQueryInput } from "./query-input.js";
import { relationships, schemaOverview, schemaSearch, tableDetail } from "./schema.js";

const CONFIG_VERBS = new Set(["init", "get", "path"]);
const csvType = extendType(string, (value) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
);
const positiveIntegerType = extendType(string, (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("must be a positive integer");
  }
  return parsed;
});

const directionType = oneOf(["incoming", "outgoing", "both"]);

export function createPgcCli(dependencies = {}) {
  return subcommands({
    name: "pgc",
    description: "Read-only PostgreSQL explorer for agents.",
    cmds: {
      doctor: commandLeaf("doctor", "Verify configuration and optionally database reachability.", {
        ...outputArgs(),
        session: textOption("session", "Named PostgreSQL session to diagnose.")
      }, async (args) => {
        const config = await loadConfig(dependencies);
        const base = { ok: true, tool: "pgc", config: config.safeView() };
        if (!args.session) {
          return base;
        }

        const session = config.getSession(args.session);
        return { ...base, session: session.name, diagnosis: await diagnoseSession(session, dependencies) };
      }),
      sessions: subcommands({
        name: "sessions",
        description: "Inspect configured PostgreSQL sessions.",
        cmds: {
          list: commandLeaf("list", "List safe metadata for named sessions.", outputArgs(), async () => {
            const config = await loadConfig(dependencies);
            return { ok: true, sessions: config.listSessions() };
          })
        }
      }),
      config: subcommands({
        name: "config",
        description: "Manage persisted PostgreSQL CLI configuration.",
        cmds: {
          init: commandLeaf("init", "Create or update the global config file.", {
            ...outputArgs(),
            force: flag({ long: "force", description: "Overwrite an existing config file." })
          }, async (args) => {
            const config = await loadConfig(dependencies);
            return config.init({ force: args.force });
          }),
          get: commandLeaf("get", "Show resolved config metadata.", outputArgs(), async () => {
            const config = await loadConfig(dependencies);
            return { ok: true, ...config.safeView() };
          }),
          path: commandLeaf("path", "Print the absolute config path.", outputArgs(), async () => {
            const config = await loadConfig(dependencies);
            return { ok: true, path: config.path };
          })
        }
      }),
      schema: subcommands({
        name: "schema",
        description: "Explore PostgreSQL schema metadata progressively.",
        cmds: {
          overview: commandLeaf("overview", "List schemas and bounded object counts.", {
            ...outputArgs(),
            session: requiredTextOption("session", "Named PostgreSQL session."),
            limit: numberOption("limit", "Maximum number of schemas to return.")
          }, async (args) => schemaOverview(await loadConfig(dependencies), { ...args, ...dependencies })),
          search: commandLeaf("search", "Find tables, views, routines, and columns by name or comment.", {
            ...outputArgs(),
            session: requiredTextOption("session", "Named PostgreSQL session."),
            query: requiredTextOption("query", "Text to search in object names and comments."),
            type: textOption("type", "Restrict results to table, view, routine, or column."),
            schema: textOption("schema", "Restrict results to one schema."),
            limit: numberOption("limit", "Maximum number of objects to return.")
          }, async (args) => schemaSearch(await loadConfig(dependencies), { ...args, ...dependencies })),
          table: commandLeaf("table", "Inspect one table, its columns, constraints, and relationships.", {
            ...outputArgs(),
            session: requiredTextOption("session", "Named PostgreSQL session."),
            schema: requiredTextOption("schema", "PostgreSQL schema name."),
            table: requiredTextOption("table", "PostgreSQL table name.")
          }, async (args) => tableDetail(await loadConfig(dependencies), { ...args, ...dependencies })),
          relations: commandLeaf("relations", "Show incoming and outgoing foreign-key relationships.", {
            ...outputArgs(),
            session: requiredTextOption("session", "Named PostgreSQL session."),
            schema: requiredTextOption("schema", "PostgreSQL schema name."),
            table: requiredTextOption("table", "PostgreSQL table name."),
            direction: option({
              long: "direction",
              type: optional(directionType),
              description: "Relationship direction: incoming, outgoing, or both."
            })
          }, async (args) => {
            const config = await loadConfig(dependencies);
            const result = await relationships(config, { ...args, ...dependencies });
            return {
              ok: true,
              kind: "schema-relations",
              session: args.session,
              table: { schema: args.schema, name: args.table },
              ...result
            };
          })
        }
      }),
      query: commandLeaf("query", "Execute one bounded, read-only PostgreSQL query.", {
        ...outputArgs(),
        session: requiredTextOption("session", "Named PostgreSQL session."),
        sql: textOption("sql", "SQL query text."),
        sqlFile: textOption("sql-file", "UTF-8 file containing the SQL query."),
        params: textOption("params", "Query parameters as a JSON array."),
        rowLimit: numberOption("row-limit", "Positive per-query row-limit override.")
      }, async (args) => {
        const config = await loadConfig(dependencies);
        const session = config.getSession(args.session);
        const sql = await resolveQueryInput(args, config.fsImpl);
        const rowLimit = parseRowLimit(args.rowLimit);
        const result = await executeReadQuery(
          session,
          sql,
          parseJsonArray(args.params, "query parameters"),
          { ...dependencies, ...args, rowLimit }
        );
        return { ok: true, kind: "query", session: session.name, ...result };
      }),
      compare: commandLeaf("compare", "Compare the results of two queries by same-named key columns.", {
        ...outputArgs(),
        leftSession: requiredTextOption("left-session", "Named session for the left query."),
        rightSession: requiredTextOption("right-session", "Named session for the right query."),
        leftQuery: requiredTextOption("left-query", "SQL query for the left session."),
        rightQuery: requiredTextOption("right-query", "SQL query for the right session."),
        leftParams: textOption("left-params", "Left query parameters as a JSON array."),
        rightParams: textOption("right-params", "Right query parameters as a JSON array."),
        key: option({
          long: "key",
          type: csvType,
          description: "Comma-separated same-named key columns."
        })
      }, async (args) => compareQueries(await loadConfig(dependencies), { ...args, ...dependencies }))
    }
  });
}

export const pgcCli = createPgcCli();

export function normalizePgcArgv(argv) {
  if (argv.length === 0) {
    return ["--help"];
  }

  const leadingFlags = [];
  let index = 0;
  while (index < argv.length && ["--json", "--md", "--csv", "--compact", "--force"].includes(argv[index])) {
    leadingFlags.push(argv[index]);
    index += 1;
  }

  const normalized = index === 0 ? argv : [...argv.slice(index), ...leadingFlags];
  const [first, second] = normalized;
  if (CONFIG_VERBS.has(first) && (!second || second.startsWith("-"))) {
    return ["config", ...normalized];
  }

  return normalized;
}

export function unwrapCommandResult(value) {
  if (value && typeof value === "object" && "command" in value && "value" in value) {
    return unwrapCommandResult(value.value);
  }

  return value;
}

function commandLeaf(name, description, args, execute) {
  return command({
    name,
    description,
    args,
    handler: async (parsedArgs) => ({
      result: await execute(parsedArgs),
      outputOptions: pickOutputOptions(parsedArgs)
    })
  });
}

function outputArgs() {
  return {
    fields: csvOption("fields", "Comma-separated fields to project from the output."),
    json: flag({ long: "json", description: "Force JSON output." }),
    md: flag({ long: "md", description: "Force Markdown output." }),
    csv: flag({ long: "csv", description: "Force CSV output for tabular query results." }),
    compact: flag({ long: "compact", description: "Use compact JSON output." })
  };
}

function requiredTextOption(long, description) {
  return option({ long, type: string, description });
}

function textOption(long, description) {
  return option({ long, type: optional(string), description });
}

function csvOption(long, description) {
  return option({ long, type: optional(csvType), description });
}

function numberOption(long, description) {
  return option({ long, type: optional(positiveIntegerType), description });
}

function pickOutputOptions(args) {
  return {
    fields: args.fields,
    json: args.json,
    md: args.md,
    csv: args.csv,
    compact: args.compact
  };
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
