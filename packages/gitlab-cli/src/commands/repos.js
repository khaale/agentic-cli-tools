import { fail } from "../lib/errors.js";
import { summarizeRef, summarizeRepoEntry } from "../lib/schemas.js";

export async function repoTree(client, options) {
  requireProject(options, "repos tree");

  const data = await client.requestPage(`${client.projectPath(options.project)}/repository/tree`, {
    query: {
      path: options.path,
      ref: options.ref
    },
    refresh: options.refresh,
    page: options.page,
    perPage: options.limit,
    scope: { resource: "repos", project: options.project, ref: options.ref, path: options.path }
  });

  return {
    kind: "list",
    data: options.full ? data : data.map(summarizeRepoEntry)
  };
}

export async function repoRefs(client, options) {
  requireProject(options, "repos refs");

  const kind = options.kind === "tags" ? "tags" : "branches";
  const data = await client.requestPage(`${client.projectPath(options.project)}/repository/${kind}`, {
    query: {
      search: options.search
    },
    refresh: options.refresh,
    page: options.page,
    perPage: options.limit,
    scope: { resource: "repos", project: options.project, kind }
  });

  return {
    kind: "list",
    data: options.full ? data : data.map((entry) => summarizeRef(entry, kind === "tags" ? "tag" : "branch"))
  };
}

export async function repoFile(client, options) {
  requireProject(options, "repos file");
  if (!options.path) {
    fail("repos file requires --path <repository-path>", 2);
  }

  const encodedPath = options.path
    .split("/")
    .map(encodeURIComponent)
    .join("%2F");

  const data = await client.requestJson(
    `${client.projectPath(options.project)}/repository/files/${encodedPath}/raw`,
    {
      query: {
        ref: options.ref
      },
      raw: true,
      refresh: options.refresh,
      scope: { resource: "repos", project: options.project, ref: options.ref, path: options.path }
    }
  );

  return { kind: "raw", data };
}

function requireProject(options, label) {
  if (!options.project) {
    fail(`${label} requires --project <path-with-namespace>`, 2);
  }
}
