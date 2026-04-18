import { fail } from "../lib/errors.js";
import { buildListQuery } from "../lib/gitlab.js";
import { summarizeJob } from "../lib/schemas.js";

export async function listJobs(client, options) {
  if (!options.project) {
    fail("jobs list requires --project <path-with-namespace>", 2);
  }

  const basePath = options.pipeline
    ? `${client.projectPath(options.project)}/pipelines/${options.pipeline}/jobs`
    : `${client.projectPath(options.project)}/jobs`;

  const data = await client.requestAllPages(basePath, {
    query: buildListQuery(options),
    refresh: options.refresh,
    maxItems: options.limit,
    scope: { resource: "jobs", project: options.project, pipeline: options.pipeline }
  });

  return {
    kind: "list",
    data: options.full ? data : data.map(summarizeJob)
  };
}

export async function getJob(client, options) {
  if (!options.project || !options.job) {
    fail("jobs get requires --project <path> and --job <id>", 2);
  }

  const data = await client.requestJson(`${client.projectPath(options.project)}/jobs/${options.job}`, {
    refresh: options.refresh,
    scope: { resource: "jobs", project: options.project, job: options.job }
  });

  return { kind: "get", data };
}

export async function jobTrace(client, options) {
  if (!options.project || !options.job) {
    fail("jobs trace requires --project <path> and --job <id>", 2);
  }

  const data = await client.requestJson(`${client.projectPath(options.project)}/jobs/${options.job}/trace`, {
    raw: true,
    refresh: options.refresh,
    scope: { resource: "jobs", project: options.project, job: options.job }
  });

  return { kind: "raw", data };
}
