import { command, extendType, flag, option, optional, string, subcommands, number } from "cmd-ts";
import { apiRequest } from "../commands/api.js";
import { cacheClear, cacheStatus, cacheWarm } from "../commands/cache.js";
import { doctor } from "../commands/doctor.js";
import { configGet, configInit, configPath } from "../commands/config.js";
import { getGroup, groupsTree, listGroups } from "../commands/groups.js";
import { getJob, jobTrace, listJobs } from "../commands/jobs.js";
import {
  getMergeRequest,
  getMergeRequestChanges,
  listMergeRequestCommits,
  listMergeRequestPipelines,
  listMergeRequestVersions,
  listMergeRequests,
  snapshotMergeRequest
} from "../commands/mrs.js";
import { getPipeline, listPipelines } from "../commands/pipelines.js";
import { getProject, listProjects, projectTree } from "../commands/projects.js";
import { repoFile, repoRefs, repoTree } from "../commands/repos.js";
import { FileCache } from "./cache.js";
import { loadConfig } from "./config.js";
import { CliError } from "./errors.js";
import { GitLabClient } from "./gitlab.js";

const CONFIG_VERBS = new Set(["init", "get", "path"]);
const csvType = extendType(string, (value) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
);

export const gitLabCli = subcommands({
  name: "glc",
  description: "GitLab explorer CLI for agents and shell users.",
  cmds: {
    doctor: commandLeaf("doctor", "Verify config, auth, cache, and API reachability.", {
      ...outputArgs()
    }, async () => doctor({})),
    api: resource("api", "Run read-only raw API requests.", {
      request: clientLeaf("request", "Perform a read-only GitLab API request.", {
        ...outputArgs(),
        ...refreshArgs(),
        method: textOption("method", "HTTP method. Only GET and HEAD are supported."),
        path: requiredTextOption("path", "Absolute GitLab API path, for example /api/v4/projects."),
        query: textOption("query", "Optional URL query string, for example per_page=1&page=2.")
      }, async (args, { client }) => apiRequest(client, {
        method: args.method,
        path: args.path,
        query: args.query,
        refresh: args.refresh
      }))
    }),
    groups: resource("groups", "Inspect groups and group trees.", {
      list: clientLeaf("list", "List groups.", {
        ...outputArgs(),
        ...refreshArgs(),
        group: textOption("group", "Restrict listing to descendants of one group."),
        search: textOption("search", "Filter groups by search text."),
        state: textOption("state", "Pass a state/status filter to the API when supported."),
        sort: textOption("sort", "Sort order to pass to the API."),
        limit: numberArg("limit", "Maximum number of items to return.")
      }, async (args, { client }) => listGroups(client, {
        group: args.group,
        search: args.search,
        state: args.state,
        sort: args.sort,
        limit: args.limit,
        refresh: args.refresh,
        full: args.full
      })),
      get: clientLeaf("get", "Get one group.", {
        ...outputArgs(),
        ...refreshArgs(),
        group: requiredTextOption("group", "GitLab group full path.")
      }, async (args, { client }) => getGroup(client, {
        group: args.group,
        refresh: args.refresh
      })),
      tree: clientLeaf("tree", "Render a group tree.", {
        ...outputArgs(),
        ...refreshArgs(),
        group: requiredTextOption("group", "GitLab group full path.")
      }, async (args, { client }) => groupsTree(client, {
        group: args.group,
        refresh: args.refresh,
        full: args.full
      }))
    }),
    projects: resource("projects", "Inspect projects.", {
      list: clientLeaf("list", "List projects.", {
        ...outputArgs(),
        ...refreshArgs(),
        group: textOption("group", "Limit to a GitLab group."),
        project: textOption("project", "Optional project selector for cache scoping."),
        search: textOption("search", "Filter projects by search text."),
        state: textOption("state", "Pass a state/status filter to the API when supported."),
        sort: textOption("sort", "Sort order to pass to the API."),
        limit: numberArg("limit", "Maximum number of items to return.")
      }, async (args, { client }) => listProjects(client, {
        group: args.group,
        project: args.project,
        search: args.search,
        state: args.state,
        sort: args.sort,
        limit: args.limit,
        refresh: args.refresh,
        full: args.full
      })),
      get: clientLeaf("get", "Get one project.", {
        ...outputArgs(),
        ...refreshArgs(),
        project: requiredTextOption("project", "GitLab project path with namespace.")
      }, async (args, { client }) => getProject(client, {
        project: args.project,
        refresh: args.refresh,
        full: args.full
      })),
      tree: clientLeaf("tree", "Render a project tree summary.", {
        ...outputArgs(),
        ...refreshArgs(),
        project: requiredTextOption("project", "GitLab project path with namespace.")
      }, async (args, { client }) => projectTree(client, {
        project: args.project,
        refresh: args.refresh,
        full: args.full
      }))
    }),
    repos: resource("repos", "Inspect repository contents.", {
      tree: clientLeaf("tree", "List repository tree entries.", {
        ...outputArgs(),
        ...refreshArgs(),
        project: requiredTextOption("project", "GitLab project path with namespace."),
        path: textOption("path", "Repository subpath."),
        ref: textOption("ref", "Branch, tag, or commit."),
        page: numberArg("page", "Page number."),
        limit: numberArg("limit", "Page size.")
      }, async (args, { client }) => repoTree(client, {
        project: args.project,
        path: args.path,
        ref: args.ref,
        page: args.page,
        limit: args.limit,
        refresh: args.refresh,
        full: args.full
      })),
      refs: clientLeaf("refs", "List branches or tags.", {
        ...outputArgs(),
        ...refreshArgs(),
        project: requiredTextOption("project", "GitLab project path with namespace."),
        kind: textOption("kind", "Use `tags` to list tags; defaults to branches."),
        search: textOption("search", "Search refs by name."),
        page: numberArg("page", "Page number."),
        limit: numberArg("limit", "Page size.")
      }, async (args, { client }) => repoRefs(client, {
        project: args.project,
        kind: args.kind,
        search: args.search,
        page: args.page,
        limit: args.limit,
        refresh: args.refresh,
        full: args.full
      })),
      file: clientLeaf("file", "Read one repository file.", {
        ...outputArgs(),
        ...refreshArgs(),
        project: requiredTextOption("project", "GitLab project path with namespace."),
        path: requiredTextOption("path", "Repository path to the file."),
        ref: textOption("ref", "Branch, tag, or commit.")
      }, async (args, { client }) => repoFile(client, {
        project: args.project,
        path: args.path,
        ref: args.ref,
        refresh: args.refresh
      }))
    }),
    mrs: resource("mrs", "Inspect merge requests.", {
      list: clientLeaf("list", "List merge requests.", {
        ...outputArgs(),
        ...refreshArgs(),
        group: textOption("group", "Limit to a GitLab group."),
        project: textOption("project", "Limit to a GitLab project."),
        search: textOption("search", "Filter merge requests by search text."),
        state: textOption("state", "Merge request state."),
        sort: textOption("sort", "Sort direction."),
        orderBy: textOption("order-by", "Merge request order field."),
        author: textOption("author", "Author username."),
        sourceBranch: textOption("source-branch", "Source branch name."),
        targetBranch: textOption("target-branch", "Target branch name."),
        scope: textOption("scope", "GitLab merge request scope."),
        limit: numberArg("limit", "Maximum number of items to return.")
      }, async (args, { client }) => listMergeRequests(client, {
        group: args.group,
        project: args.project,
        search: args.search,
        state: args.state,
        sort: args.sort,
        orderBy: args.orderBy,
        author: args.author,
        sourceBranch: args.sourceBranch,
        targetBranch: args.targetBranch,
        scope: args.scope,
        limit: args.limit,
        refresh: args.refresh,
        full: args.full
      })),
      get: clientLeaf("get", "Get one merge request.", {
        ...outputArgs(),
        ...refreshArgs(),
        project: requiredTextOption("project", "GitLab project path with namespace."),
        mr: requiredTextOption("mr", "Merge request IID."),
        with: csvArg("with", "Include related datasets like commits, discussions, or changes.")
      }, async (args, { client }) => getMergeRequest(client, {
        project: args.project,
        mr: args.mr,
        with: args.with,
        refresh: args.refresh,
        full: args.full
      })),
      commits: clientLeaf("commits", "List merge request commits.", {
        ...outputArgs(),
        ...refreshArgs(),
        project: requiredTextOption("project", "GitLab project path with namespace."),
        mr: requiredTextOption("mr", "Merge request IID."),
        limit: numberArg("limit", "Maximum number of items to return.")
      }, async (args, { client }) => listMergeRequestCommits(client, {
        project: args.project,
        mr: args.mr,
        limit: args.limit,
        refresh: args.refresh,
        full: args.full
      })),
      pipelines: clientLeaf("pipelines", "List merge request pipelines.", {
        ...outputArgs(),
        ...refreshArgs(),
        project: requiredTextOption("project", "GitLab project path with namespace."),
        mr: requiredTextOption("mr", "Merge request IID."),
        limit: numberArg("limit", "Maximum number of items to return.")
      }, async (args, { client }) => listMergeRequestPipelines(client, {
        project: args.project,
        mr: args.mr,
        limit: args.limit,
        refresh: args.refresh,
        full: args.full
      })),
      versions: clientLeaf("versions", "List merge request diff versions.", {
        ...outputArgs(),
        ...refreshArgs(),
        project: requiredTextOption("project", "GitLab project path with namespace."),
        mr: requiredTextOption("mr", "Merge request IID.")
      }, async (args, { client }) => listMergeRequestVersions(client, {
        project: args.project,
        mr: args.mr,
        refresh: args.refresh,
        full: args.full
      })),
      changes: clientLeaf("changes", "Get merge request changes.", {
        ...outputArgs(),
        ...refreshArgs(),
        project: requiredTextOption("project", "GitLab project path with namespace."),
        mr: requiredTextOption("mr", "Merge request IID."),
        version: textOption("version", "Diff version id or `latest`."),
        patch: flag({ long: "patch", description: "Include diff text in the output." })
      }, async (args, { client }) => getMergeRequestChanges(client, {
        project: args.project,
        mr: args.mr,
        version: args.version,
        patch: args.patch,
        refresh: args.refresh
      })),
      snapshot: clientLeaf("snapshot", "Write an agent-friendly merge request snapshot bundle.", {
        ...outputArgs(),
        ...refreshArgs(),
        project: requiredTextOption("project", "GitLab project path with namespace."),
        mr: requiredTextOption("mr", "Merge request IID."),
        outputDir: requiredTextOption("output-dir", "Output directory for the snapshot."),
        include: csvArg("include", "Datasets to include in the snapshot."),
        version: textOption("version", "Diff version id or `latest`.")
      }, async (args, { client, config }) => snapshotMergeRequest(client, {
        project: args.project,
        mr: args.mr,
        outputDir: args.outputDir,
        include: args.include,
        version: args.version,
        refresh: args.refresh,
        taskIdPattern: config.taskIdPattern
      }))
    }),
    pipelines: resource("pipelines", "Inspect pipelines.", {
      list: clientLeaf("list", "List pipelines.", {
        ...outputArgs(),
        ...refreshArgs(),
        project: requiredTextOption("project", "GitLab project path with namespace."),
        search: textOption("search", "Filter pipelines by search text."),
        state: textOption("state", "Pipeline state."),
        sort: textOption("sort", "Sort order."),
        limit: numberArg("limit", "Maximum number of items to return.")
      }, async (args, { client }) => listPipelines(client, {
        project: args.project,
        search: args.search,
        state: args.state,
        sort: args.sort,
        limit: args.limit,
        refresh: args.refresh,
        full: args.full
      })),
      get: clientLeaf("get", "Get one pipeline.", {
        ...outputArgs(),
        ...refreshArgs(),
        project: requiredTextOption("project", "GitLab project path with namespace."),
        pipeline: requiredTextOption("pipeline", "Pipeline id.")
      }, async (args, { client }) => getPipeline(client, {
        project: args.project,
        pipeline: args.pipeline,
        refresh: args.refresh
      }))
    }),
    jobs: resource("jobs", "Inspect jobs.", {
      list: clientLeaf("list", "List jobs.", {
        ...outputArgs(),
        ...refreshArgs(),
        project: requiredTextOption("project", "GitLab project path with namespace."),
        pipeline: textOption("pipeline", "Limit jobs to one pipeline id."),
        search: textOption("search", "Filter jobs by search text."),
        state: textOption("state", "Job state."),
        sort: textOption("sort", "Sort order."),
        limit: numberArg("limit", "Maximum number of items to return.")
      }, async (args, { client }) => listJobs(client, {
        project: args.project,
        pipeline: args.pipeline,
        search: args.search,
        state: args.state,
        sort: args.sort,
        limit: args.limit,
        refresh: args.refresh,
        full: args.full
      })),
      get: clientLeaf("get", "Get one job.", {
        ...outputArgs(),
        ...refreshArgs(),
        project: requiredTextOption("project", "GitLab project path with namespace."),
        job: requiredTextOption("job", "Job id.")
      }, async (args, { client }) => getJob(client, {
        project: args.project,
        job: args.job,
        refresh: args.refresh
      })),
      trace: clientLeaf("trace", "Read one job trace.", {
        ...outputArgs(),
        ...refreshArgs(),
        project: requiredTextOption("project", "GitLab project path with namespace."),
        job: requiredTextOption("job", "Job id.")
      }, async (args, { client }) => jobTrace(client, {
        project: args.project,
        job: args.job,
        refresh: args.refresh
      }))
    }),
    cache: resource("cache", "Inspect or manage the local cache.", {
      status: clientLeaf("status", "Show cache status.", {
        ...outputArgs()
      }, async (_args, { client }) => cacheStatus(client)),
      clear: clientLeaf("clear", "Clear cache entries.", {
        ...outputArgs(),
        group: textOption("group", "Clear entries scoped to one group."),
        project: textOption("project", "Clear entries scoped to one project.")
      }, async (args, { client }) => cacheClear(client, {
        group: args.group,
        project: args.project
      })),
      warm: clientLeaf("warm", "Warm cache entries by reading common API endpoints.", {
        ...outputArgs(),
        ...refreshArgs(),
        group: textOption("group", "Warm entries for one group."),
        project: textOption("project", "Warm entries for one project.")
      }, async (args, { client }) => cacheWarm(client, {
        group: args.group,
        project: args.project,
        refresh: args.refresh
      }))
    }),
    config: resource("config", "Manage persisted GitLab CLI configuration.", {
      init: commandLeaf("init", "Create or update the global config file.", {
        ...outputArgs(),
        force: flag({ long: "force", description: "Overwrite an existing config file." }),
        gitlabHost: textOption("gitlab-host", "GitLab base URL."),
        gitlabToken: textOption("gitlab-token", "GitLab private token."),
        gitlabCacheDir: textOption("gitlab-cache-dir", "Cache directory."),
        gitlabTaskIdPattern: textOption("gitlab-task-id-pattern", "Regex used to extract task ids from MR titles.")
      }, async (args) => configInit({
        force: args.force,
        gitlabHost: args.gitlabHost,
        gitlabToken: args.gitlabToken,
        gitlabCacheDir: args.gitlabCacheDir,
        gitlabTaskIdPattern: args.gitlabTaskIdPattern
      })),
      get: commandLeaf("get", "Show resolved config metadata.", {
        ...outputArgs()
      }, async () => configGet({})),
      path: commandLeaf("path", "Print the absolute config path.", {
        ...outputArgs()
      }, async () => configPath({}))
    })
  }
});

export function normalizeGitLabArgv(argv) {
  if (argv.includes("--all")) {
    throw new CliError("--all is no longer supported; list commands return all results by default", 2);
  }

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

function resource(name, description, cmds) {
  return subcommands({
    name,
    description,
    cmds
  });
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
    full: flag({ long: "full", description: "Return full API payloads where supported." }),
    json: flag({ long: "json", description: "Force JSON output." }),
    jsonl: flag({ long: "jsonl", description: "Force JSONL output for list-like results." }),
    raw: flag({ long: "raw", description: "Print raw values or lines." }),
    compact: flag({ long: "compact", description: "Use compact JSON output." }),
    jq: textOption("jq", "Apply a jq expression to the result before printing."),
    verbose: flag({ long: "verbose", description: "Enable verbose request logging when supported." })
  };
}

function refreshArgs() {
  return {
    refresh: flag({ long: "refresh", description: "Ignore cached responses." })
  };
}

function requiredTextOption(long, description) {
  return option({
    long,
    type: string,
    description
  });
}

function textOption(long, description) {
  return option({
    long,
    type: optional(string),
    description
  });
}

function numberArg(long, description) {
  return option({
    long,
    type: optional(number),
    description
  });
}

function csvArg(long, description) {
  return option({
    long,
    type: optional(csvType),
    description
  });
}

function pickOutputOptions(args) {
  return {
    fields: args.fields,
    full: args.full,
    json: args.json,
    jsonl: args.jsonl,
    raw: args.raw,
    compact: args.compact,
    jq: args.jq,
    verbose: args.verbose
  };
}

async function createClientRuntime() {
  const config = await loadConfig();
  const cache = new FileCache(config.cacheDir);
  const client = new GitLabClient({ host: config.host, token: config.token, cache });
  return { client, config };
}
