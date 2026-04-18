import { fail } from "../lib/errors.js";
import { buildListQuery } from "../lib/gitlab.js";
import { summarizePipeline } from "../lib/schemas.js";

export async function listPipelines(client, options) {
  if (!options.project) {
    fail("pipelines list requires --project <path-with-namespace>", 2);
  }

  const data = await client.requestAllPages(`${client.projectPath(options.project)}/pipelines`, {
    query: buildListQuery(options),
    refresh: options.refresh,
    maxItems: options.limit,
    scope: { resource: "pipelines", project: options.project }
  });

  return {
    kind: "list",
    data: options.full ? data : data.map((item) => summarizePipeline(item, options.project))
  };
}

export async function getPipeline(client, options) {
  if (!options.project || !options.pipeline) {
    fail("pipelines get requires --project <path> and --pipeline <id>", 2);
  }

  const data = await client.requestJson(`${client.projectPath(options.project)}/pipelines/${options.pipeline}`, {
    refresh: options.refresh,
    scope: { resource: "pipelines", project: options.project, pipeline: options.pipeline }
  });

  return { kind: "get", data };
}
