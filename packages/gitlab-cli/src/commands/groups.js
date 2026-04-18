import { fail } from "../lib/errors.js";
import { buildListQuery } from "../lib/gitlab.js";
import { summarizeGroup, summarizeProject } from "../lib/schemas.js";

export async function listGroups(client, options) {
  const group = options.group;
  const query = buildListQuery(options);
  const scope = { resource: "groups", group };
  let data;

  if (group) {
    data = await listAllDescendantGroups(client, group, options);
  } else {
    data = await client.requestAllPages("/api/v4/groups", {
      query: {
        ...query,
        all_available: true
      },
      refresh: options.refresh,
      maxItems: options.limit,
      scope: { resource: "groups", group: null, allAvailable: true }
    });
  }

  return {
    kind: "list",
    data: options.full ? data : data.map(summarizeGroup)
  };
}

async function listAllDescendantGroups(client, group, options) {
  const seen = new Map();
  await collectSubgroups(client, group, options, seen);
  const groups = [...seen.values()];
  return options.limit ? groups.slice(0, options.limit) : groups;
}

async function collectSubgroups(client, group, options, seen) {
  const subgroups = await client.requestAllPages(`${client.groupPath(group)}/subgroups`, {
    query: buildListQuery(options),
    refresh: options.refresh,
    scope: { resource: "groups", group, recursive: true }
  });

  for (const subgroup of subgroups) {
    if (seen.has(subgroup.id)) {
      continue;
    }

    seen.set(subgroup.id, subgroup);
    await collectSubgroups(client, subgroup.full_path, options, seen);
  }
}

export async function getGroup(client, options) {
  if (!options.group) {
    fail("groups get requires --group <full-path>", 2);
  }

  const data = await client.requestJson(client.groupPath(options.group), {
    refresh: options.refresh,
    scope: { resource: "groups", group: options.group }
  });

  return { kind: "get", data };
}

export async function groupsTree(client, options) {
  if (!options.group) {
    fail("groups tree requires --group <full-path>", 2);
  }

  const data = await buildGroupTree(client, options.group, options);
  return { kind: "tree", data };
}

async function buildGroupTree(client, group, options) {
  const groupInfo = await client.requestJson(client.groupPath(group), {
    refresh: options.refresh,
    scope: { resource: "groups", group }
  });
  const subgroups = await client.requestAllPages(`${client.groupPath(group)}/subgroups`, {
    refresh: options.refresh,
    scope: { resource: "groups", group }
  });
  const projects = await client.requestAllPages(`${client.groupPath(group)}/projects`, {
    refresh: options.refresh,
    scope: { resource: "groups", group }
  });

  const subgroupChildren = [];
  for (const subgroup of subgroups) {
    subgroupChildren.push(await buildGroupTree(client, subgroup.full_path, options));
  }

  const projectChildren = projects.map((project) => ({
    kind: "project",
    label: `project ${project.path}`,
    data: summarizeProject(project),
    children: []
  }));

  return {
    kind: "group",
    label: groupInfo.full_path,
    data: summarizeGroup(groupInfo),
    children: [...subgroupChildren, ...projectChildren]
  };
}
