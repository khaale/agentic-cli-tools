export async function cacheStatus(client) {
  const entries = await client.cache.list();
  const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  return {
    kind: "get",
    data: {
      entries: entries.length,
      total_bytes: totalBytes,
      items: entries
    }
  };
}

export async function cacheClear(client, options) {
  const removed = await client.cache.clear({
    group: options.group,
    project: options.project
  });

  return {
    kind: "get",
    data: {
      removed: removed.length,
      items: removed
    }
  };
}

export async function cacheWarm(client, options) {
  const warmed = [];

  if (options.group) {
    await client.requestPage(`${client.groupPath(options.group)}/projects`, {
      refresh: options.refresh,
      scope: { resource: "projects", group: options.group }
    });
    await client.requestPage(`${client.groupPath(options.group)}/subgroups`, {
      refresh: options.refresh,
      scope: { resource: "groups", group: options.group }
    });
    warmed.push(`group:${options.group}`);
  }

  if (options.project) {
    await client.requestJson(client.projectPath(options.project), {
      refresh: options.refresh,
      scope: { resource: "projects", project: options.project }
    });
    await client.requestPage(`${client.projectPath(options.project)}/pipelines`, {
      refresh: options.refresh,
      scope: { resource: "pipelines", project: options.project }
    });
    warmed.push(`project:${options.project}`);
  }

  return {
    kind: "get",
    data: {
      warmed
    }
  };
}
