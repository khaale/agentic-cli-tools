import {
  command,
  extendType,
  flag,
  option,
  optional,
  restPositionals,
  string,
  subcommands,
  number
} from "cmd-ts";
import { apiRequest } from "../commands/api.js";
import { configGet, configInit, configPath } from "../commands/config.js";
import { doctor } from "../commands/doctor.js";
import { findTasks, getTask, listMineTasks } from "../commands/tasks.js";
import { getTaskComments } from "../commands/task-comments.js";
import { FileCache } from "./cache.js";
import { loadConfig } from "./config.js";
import { CliError, fail } from "./errors.js";
import { KaitenClient } from "./kaiten.js";

const CONFIG_VERBS = new Set(["init", "get", "path"]);
const csvType = extendType(string, (value) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
);
const stateType = extendType(string, (value) => normalizeState(value));

export const kaitenCli = subcommands({
  name: "ktc",
  description: "Read-oriented Kaiten explorer CLI for tasks and cards.",
  cmds: {
    doctor: commandLeaf("doctor", "Verify config, auth, cache, and API reachability.", {
      ...outputArgs()
    }, async () => doctor({})),
    api: subcommands({
      name: "api",
      description: "Run read-only raw API requests.",
      cmds: {
        request: clientLeaf("request", "Perform a read-only Kaiten API request.", {
          ...outputArgs(),
          ...runtimeArgs(),
          method: textOption("method", "HTTP method. Only GET and HEAD are supported."),
          path: requiredTextOption("path", "Absolute Kaiten API path, for example /api/latest/cards."),
          query: textOption("query", "Optional URL query string, for example query=platform&limit=1.")
        }, async (args, { client }) => apiRequest(client, {
          method: args.method,
          path: args.path,
          query: args.query,
          refresh: args.refresh
        }))
      }
    }),
    tasks: subcommands({
      name: "tasks",
      description: "Inspect Kaiten tasks.",
      cmds: {
        mine: clientLeaf("mine", "List my open tasks.", {
          ...outputArgs(),
          ...runtimeArgs(),
          space: textOption("space", "Filter by space id, uid, or title."),
          board: textOption("board", "Filter by board id, uid, or title."),
          since: textOption("since", "Filter tasks updated after this date (ISO8601 or relative like 2w, 1m)."),
          till: textOption("till", "Filter tasks updated before this date (ISO8601 or relative like 1w, 1m)."),
          limit: numberArg("limit", "Maximum number of tasks to return.")
        }, async (args, { client }) => listMineTasks(client, {
          space: args.space,
          board: args.board,
          since: args.since,
          till: args.till,
          limit: args.limit,
          refresh: args.refresh,
          verbose: args.verbose
        })),
        find: clientLeaf("find", "Find tasks by assignee, board, or text.", {
          ...outputArgs(),
          ...runtimeArgs(),
          space: textOption("space", "Filter by space id, uid, or title."),
          board: textOption("board", "Filter by board id, uid, or title."),
          assignee: textOption("assignee", "Filter by me, id, uid, email, username, or name."),
          search: textOption("search", "Search text."),
          state: stateArg("state", "Task state: open, done, archived, all, or active."),
          since: textOption("since", "Filter tasks updated after this date (ISO8601 or relative like 2w, 1m)."),
          till: textOption("till", "Filter tasks updated before this date (ISO8601 or relative like 1w, 1m)."),
          limit: numberArg("limit", "Maximum number of items to return."),
          query: restPositionals({
            displayName: "search",
            description: "Optional free-text search terms.",
            type: string
          })
        }, async (args, { client }) => findTasks(client, {
          space: args.space,
          board: args.board,
          assignee: args.assignee,
          search: args.search || joinTerms(args.query),
          state: args.state,
          since: args.since,
          till: args.till,
          limit: args.limit,
          refresh: args.refresh,
          verbose: args.verbose
        })),
        get: clientLeaf("get", "Get one task.", {
          ...outputArgs(),
          ...runtimeArgs(),
          id: requiredTextOption("id", "Task id.")
        }, async (args, { client }) => getTask(client, {
          task: args.id,
          refresh: args.refresh,
          verbose: args.verbose
        }))
      }
    }),
    "task-comments": subcommands({
      name: "task-comments",
      description: "Inspect Kaiten task comments.",
      cmds: {
        get: clientLeaf("get", "Get comments for a task.", {
          ...outputArgs(),
          ...runtimeArgs(),
          task: requiredTextOption("task", "Task id.")
        }, async (args, { client }) => getTaskComments(client, {
          task: args.task,
          refresh: args.refresh,
          verbose: args.verbose
        }))
      }
    }),
    config: subcommands({
      name: "config",
      description: "Manage persisted Kaiten CLI configuration.",
      cmds: {
        init: commandLeaf("init", "Create or update the global config file.", {
          ...outputArgs(),
          force: flag({ long: "force", description: "Overwrite an existing config file." }),
          kaitenUrl: textOption("kaiten-url", "Kaiten base URL."),
          kaitenApiToken: textOption("kaiten-api-token", "Kaiten API token."),
          kaitenApiBase: textOption("kaiten-api-base", "Kaiten API base path."),
          kaitenBrokenApi: flag({ long: "kaiten-broken-api", description: "Enable broken API compatibility mode." }),
          kaitenCacheDir: textOption("kaiten-cache-dir", "Cache directory.")
        }, async (args) => configInit({
          force: args.force,
          kaitenUrl: args.kaitenUrl,
          kaitenApiToken: args.kaitenApiToken,
          kaitenApiBase: args.kaitenApiBase,
          kaitenBrokenApi: args.kaitenBrokenApi ? true : undefined,
          kaitenCacheDir: args.kaitenCacheDir
        })),
        get: commandLeaf("get", "Show resolved config metadata.", outputArgs(), async () => configGet({})),
        path: commandLeaf("path", "Print the absolute config path.", outputArgs(), async () => configPath({}))
      }
    })
  }
});

export function normalizeKaitenArgv(argv) {
  if (argv.length === 0) {
    return ["--help"];
  }

  const [first, second] = argv;
  if (CONFIG_VERBS.has(first) && (!second || second.startsWith("-"))) {
    return ["config", ...argv];
  }

  return argv;
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

function clientLeaf(name, description, args, execute) {
  return command({
    name,
    description,
    args,
    handler: async (parsedArgs) => {
      const runtime = await createClientRuntime();
      return {
        result: await execute(parsedArgs, runtime),
        outputOptions: pickOutputOptions(parsedArgs)
      };
    }
  });
}

function outputArgs() {
  return {
    fields: csvArg("fields", "Comma-separated fields to project from the output."),
    json: flag({ long: "json", description: "Force JSON output." }),
    md: flag({ long: "md", description: "Force Markdown output." }),
    raw: flag({ long: "raw", description: "Print raw values without Markdown or JSON wrapping." }),
    compact: flag({ long: "compact", description: "Use compact JSON output." })
  };
}

function runtimeArgs() {
  return {
    refresh: flag({ long: "refresh", description: "Ignore cached responses." }),
    verbose: flag({ long: "verbose", description: "Enable verbose request logging." })
  };
}

function requiredTextOption(long, description) {
  return option({ long, type: string, description });
}

function textOption(long, description) {
  return option({ long, type: optional(string), description });
}

function numberArg(long, description) {
  return option({ long, type: optional(number), description });
}

function csvArg(long, description) {
  return option({ long, type: optional(csvType), description });
}

function stateArg(long, description) {
  return option({ long, type: optional(stateType), description });
}

function pickOutputOptions(args) {
  return {
    fields: args.fields,
    json: args.json,
    md: args.md,
    raw: args.raw,
    compact: args.compact
  };
}

function normalizeState(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "active") {
    return "open";
  }

  if (["open", "done", "all", "archived"].includes(normalized)) {
    return normalized;
  }

  fail(`unsupported state value: ${value}`, 2);
}

function joinTerms(terms) {
  if (!Array.isArray(terms) || terms.length === 0) {
    return undefined;
  }

  const text = terms.join(" ").trim();
  return text || undefined;
}

async function createClientRuntime() {
  const config = await loadConfig();
  const cache = new FileCache(config.cacheDir);
  const client = new KaitenClient({
    host: config.host,
    apiBase: config.apiBase,
    token: config.token,
    cache,
    brokenApi: config.brokenApi
  });
  return { client, config };
}
