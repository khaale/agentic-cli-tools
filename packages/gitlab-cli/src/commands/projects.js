import { fail } from "../lib/errors.js";
import { buildListQuery } from "../lib/gitlab.js";
import { summarizePipeline, summarizeProject, summarizeRef } from "../lib/schemas.js";

export async function listProjects(client, options) {
  const query = buildListQuery(options);
  const scope = { resource: "projects", group: options.group, project: options.project };
  let data;

  if (options.group) {
    data = await client.requestAllPages(`${client.groupPath(options.group)}/projects`, {
      query,
      refresh: options.refresh,
      maxItems: options.limit,
      scope
    });
  } else {
    data = await client.requestAllPages("/api/v4/projects", {
      query,
      refresh: options.refresh,
      maxItems: options.limit,
      scope
    });
  }

  return {
    kind: "list",
    data: options.full ? data : data.map(summarizeProject)
  };
}

export async function getProject(client, options) {
  if (!options.project) {
    fail("projects get requires --project <path-with-namespace>", 2);
  }

  const data = await client.requestJson(client.projectPath(options.project), {
    refresh: options.refresh,
    scope: { resource: "projects", project: options.project }
  });

  return { kind: "get", data };
}

export async function projectTree(client, options) {
  if (!options.project) {
    fail("projects tree requires --project <path-with-namespace>", 2);
  }

  const project = await client.requestJson(client.projectPath(options.project), {
    refresh: options.refresh,
    scope: { resource: "projects", project: options.project }
  });
  const branches = await client.requestPage(`${client.projectPath(options.project)}/repository/branches`, {
    refresh: options.refresh,
    perPage: 5,
    scope: { resource: "projects", project: options.project }
  });
  const tags = await client.requestPage(`${client.projectPath(options.project)}/repository/tags`, {
    refresh: options.refresh,
    perPage: 5,
    scope: { resource: "projects", project: options.project }
  });
  const pipelines = await client.requestPage(`${client.projectPath(options.project)}/pipelines`, {
    refresh: options.refresh,
    perPage: 5,
    scope: { resource: "pipelines", project: options.project }
  });

  return {
    kind: "tree",
    data: {
      kind: "project",
      label: project.path_with_namespace,
      data: summarizeProject(project),
      children: [
        {
          kind: "refs",
          label: "refs",
          children: [
            ...branches.map((branch) => ({
              kind: "branch",
              label: `branch ${branch.name}`,
              data: summarizeRef(branch, "branch"),
              children: []
            })),
            ...tags.map((tag) => ({
              kind: "tag",
              label: `tag ${tag.name}`,
              data: summarizeRef(tag, "tag"),
              children: []
            }))
          ]
        },
        {
          kind: "pipelines",
          label: "pipelines",
          children: pipelines.map((pipeline) => ({
            kind: "pipeline",
            label: `pipeline ${pipeline.id} ${pipeline.status}`,
            data: summarizePipeline(pipeline, options.project),
            children: []
          }))
        }
      ]
    }
  };
}
