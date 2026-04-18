import fs from "node:fs/promises";
import path from "node:path";
import { fail } from "../lib/errors.js";
import { buildMergeRequestListQuery } from "../lib/gitlab.js";
import { anonymizeForOutput } from "../lib/anonymize.js";
import {
  summarizeMergeRequest,
  summarizeMrChange,
  summarizeMrCommit,
  summarizeMrPipeline,
  summarizeMrVersion
} from "../lib/schemas.js";

const DEFAULT_SNAPSHOT_DATASETS = ["overview", "discussions", "changes", "commits"];
const DEFAULT_TASK_ID_PATTERN = "#(\\d+)";
const CHANGE_ARTIFACT_ROOT = "changes";

export async function listMergeRequests(client, options) {
  const apiPath = options.project
    ? `${client.projectPath(options.project)}/merge_requests`
    : options.group
      ? `${client.groupPath(options.group)}/merge_requests`
      : "/api/v4/merge_requests";

  const data = await client.requestAllPages(apiPath, {
    query: buildMergeRequestListQuery(options),
    refresh: options.refresh,
    maxItems: options.limit,
    scope: {
      resource: "mrs",
      dataset: "list",
      project: options.project,
      group: options.group,
      state: options.state
    }
  });

  return {
    kind: "list",
    data: options.full ? data : data.map((item) => summarizeMergeRequest(item, options.project))
  };
}

export async function getMergeRequest(client, options) {
  requireProjectAndMr(options, "mrs get");

  const overview = await fetchMergeRequestOverview(client, options);
  if (!options.with || options.with.length === 0) {
    return { kind: "get", data: overview };
  }

  const data = { overview };

  for (const dataset of options.with) {
    switch (dataset) {
      case "overview":
        break;
      case "commits":
        data.commits = await fetchMergeRequestCommits(client, options);
        break;
      case "discussions":
        data.discussions = await fetchMergeRequestDiscussions(client, options);
        break;
      case "pipelines":
        data.pipelines = await fetchMergeRequestPipelines(client, options);
        break;
      case "versions":
        data.versions = await fetchMergeRequestVersions(client, options);
        break;
      case "changes":
        data.changes = (await fetchMergeRequestChanges(client, options, { patch: false })).changes;
        break;
      default:
        fail(`unsupported dataset for --with: ${dataset}`, 2);
    }
  }

  return { kind: "get", data };
}

export async function listMergeRequestCommits(client, options) {
  requireProjectAndMr(options, "mrs commits");
  const data = await fetchMergeRequestCommits(client, options);
  return {
    kind: "list",
    data: options.full ? data : data.map(summarizeMrCommit)
  };
}

export async function listMergeRequestPipelines(client, options) {
  requireProjectAndMr(options, "mrs pipelines");
  const data = await fetchMergeRequestPipelines(client, options);
  return {
    kind: "list",
    data: options.full ? data : data.map(summarizeMrPipeline)
  };
}

export async function listMergeRequestVersions(client, options) {
  requireProjectAndMr(options, "mrs versions");
  const data = await fetchMergeRequestVersions(client, options);
  return {
    kind: "list",
    data: options.full ? data : data.map(summarizeMrVersion)
  };
}

export async function getMergeRequestChanges(client, options) {
  requireProjectAndMr(options, "mrs changes");
  return {
    kind: "get",
    data: await fetchMergeRequestChanges(client, options, { patch: options.patch || false })
  };
}

export async function snapshotMergeRequest(client, options) {
  requireProjectAndMr(options, "mrs snapshot");

  if (!options.outputDir) {
    fail("mrs snapshot requires --output-dir <path>", 2);
  }

  const include = normalizeSnapshotDatasets(options.include);
  const outputDir = path.resolve(options.outputDir);
  await fs.mkdir(outputDir, { recursive: true });

  const files = [];
  const payload = {
    project: options.project,
    mr: String(options.mr)
  };

  if (include.has("overview")) {
    payload.overview = await fetchMergeRequestOverview(client, options);
  }

  if (include.has("commits")) {
    payload.commits = await fetchMergeRequestCommits(client, options);
  }

  if (include.has("discussions")) {
    payload.discussions = await fetchMergeRequestDiscussions(client, options);
  }

  if (include.has("pipelines")) {
    payload.pipelines = await fetchMergeRequestPipelines(client, options);
    await writeJson(path.join(outputDir, "pipelines.json"), payload.pipelines);
    files.push("pipelines.json");
  }

  if (include.has("versions")) {
    payload.versions = await fetchMergeRequestVersions(client, options);
    await writeJson(path.join(outputDir, "versions.json"), payload.versions);
    files.push("versions.json");
  }

  let changesResult = null;
  if (include.has("changes")) {
    changesResult = await fetchMergeRequestChanges(client, options, {
      patch: true
    });
    payload.version = changesResult.version;
  }

  if (include.has("changes") && changesResult) {
    payload.changes = changesResult.changes;
    const changeArtifacts = buildChangeArtifacts(changesResult.changes);
    payload.changeArtifacts = changeArtifacts;
    await writeChangeArtifacts(outputDir, changeArtifacts);
    await writeMarkdown(path.join(outputDir, "changes.md"), renderChangesMarkdown(changesResult, options));
    files.push("changes.md");
    files.push(...changeArtifacts.map((artifact) => artifact.artifact));
  }

  if (include.has("overview")) {
    await writeMarkdown(
      path.join(outputDir, "overview.md"),
      renderOverviewMarkdown(payload, {
        ...options,
        selectedVersionId: payload.version?.id ?? null
      })
    );
    files.unshift("overview.md");
  }

  if (include.has("discussions")) {
    await writeMarkdown(
      path.join(outputDir, "timeline.md"),
      renderTimelineMarkdown(payload.discussions, options)
    );
    files.splice(files.includes("overview.md") ? 1 : 0, 0, "timeline.md");
  }

  const manifest = {
    project: options.project,
    mr: String(options.mr),
    task_id: extractTaskId(payload.overview?.title || null, options.taskIdPattern || DEFAULT_TASK_ID_PATTERN),
    selected_version_id: payload.version?.id ?? null,
    datasets: [...include],
    generated_at: new Date().toISOString(),
    files,
    changed_files: payload.changeArtifacts?.map((artifact) => ({
      path: artifact.path,
      old_path: artifact.old_path,
      new_path: artifact.new_path,
      change_type: artifact.change_type,
      artifact: artifact.artifact,
      has_diff: artifact.has_diff,
      collapsed: artifact.collapsed,
      too_large: artifact.too_large,
      generated_file: artifact.generated_file
    })) || []
  };

  await writeJson(path.join(outputDir, "manifest.json"), manifest);

  return {
    kind: "get",
    data: {
      output_dir: outputDir,
      selected_version_id: manifest.selected_version_id,
      datasets: manifest.datasets,
      files: ["manifest.json", ...files]
    }
  };
}

async function fetchMergeRequestOverview(client, options) {
  return client.requestJson(mergeRequestPath(client, options.project, options.mr), {
    refresh: options.refresh,
    scope: {
      resource: "mrs",
      dataset: "overview",
      project: options.project,
      mr: String(options.mr)
    }
  });
}

async function fetchMergeRequestCommits(client, options) {
  return client.requestAllPages(`${mergeRequestPath(client, options.project, options.mr)}/commits`, {
    refresh: options.refresh,
    maxItems: options.limit,
    scope: {
      resource: "mrs",
      dataset: "commits",
      project: options.project,
      mr: String(options.mr)
    }
  });
}

async function fetchMergeRequestDiscussions(client, options) {
  return client.requestAllPages(`${mergeRequestPath(client, options.project, options.mr)}/discussions`, {
    refresh: options.refresh,
    maxItems: options.limit,
    scope: {
      resource: "mrs",
      dataset: "discussions",
      project: options.project,
      mr: String(options.mr)
    }
  });
}

async function fetchMergeRequestPipelines(client, options) {
  return client.requestAllPages(`${mergeRequestPath(client, options.project, options.mr)}/pipelines`, {
    refresh: options.refresh,
    maxItems: options.limit,
    scope: {
      resource: "mrs",
      dataset: "pipelines",
      project: options.project,
      mr: String(options.mr)
    }
  });
}

async function fetchMergeRequestVersions(client, options) {
  return client.requestJson(`${mergeRequestPath(client, options.project, options.mr)}/versions`, {
    refresh: options.refresh,
    scope: {
      resource: "mrs",
      dataset: "versions",
      project: options.project,
      mr: String(options.mr)
    }
  });
}

async function fetchMergeRequestChanges(client, options, { patch = false } = {}) {
  const version = await resolveMergeRequestVersion(client, options);
  const data = await client.requestJson(
    `${mergeRequestPath(client, options.project, options.mr)}/versions/${version.id}`,
    {
      query: patch ? { unidiff: true } : {},
      refresh: options.refresh,
      scope: {
        resource: "mrs",
        dataset: patch ? "patch" : "changes",
        project: options.project,
        mr: String(options.mr),
        version: String(version.id)
      }
    }
  );

  return {
    project: options.project,
    mr: String(options.mr),
    version: summarizeMrVersion(data),
    changes: (data.diffs || []).map((change) => summarizeMrChange(change, { patch }))
  };
}

async function resolveMergeRequestVersion(client, options) {
  if (options.version && options.version !== "latest") {
    return { id: options.version };
  }

  const versions = await fetchMergeRequestVersions(client, options);
  if (!Array.isArray(versions) || versions.length === 0) {
    fail("merge request has no diff versions", 4);
  }

  return [...versions].sort(compareVersionsDescending)[0];
}

function compareVersionsDescending(left, right) {
  const leftTime = Date.parse(left.created_at || "") || 0;
  const rightTime = Date.parse(right.created_at || "") || 0;
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return Number(right.id) - Number(left.id);
}

function mergeRequestPath(client, project, mr) {
  return `${client.projectPath(project)}/merge_requests/${mr}`;
}

function requireProjectAndMr(options, label) {
  if (!options.project || !options.mr) {
    fail(`${label} requires --project <path-with-namespace> and --mr <iid>`, 2);
  }
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(anonymizeForOutput(data), null, 2)}\n`, "utf8");
}

async function writeMarkdown(filePath, content) {
  await fs.writeFile(filePath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
}

function renderOverviewMarkdown(snapshot, options) {
  const overview = anonymizeForOutput(snapshot.overview || {});
  const commits = anonymizeForOutput(snapshot.commits || []);
  const changes = anonymizeForOutput(snapshot.changes || []);
  const discussions = anonymizeForOutput(snapshot.discussions || []);
  const title = overview.title || `MR ${options.mr}`;
  const taskId = extractTaskId(title, options.taskIdPattern || DEFAULT_TASK_ID_PATTERN);
  const humanDiscussions = selectHumanDiscussions(discussions);
  const timelineEntries = selectTimelineDiscussions(discussions);
  const lines = [`# Merge Request !${options.mr}: ${title}`, ""];
  const facts = [
    ["Project", options.project],
    ["Task ID", taskId],
    ["State", overview.state],
    ["Author", overview.author?.username || overview.author?.name || null],
    ["Source branch", overview.source_branch],
    ["Target branch", overview.target_branch],
    ["Updated", overview.updated_at],
    ["Selected version", options.selectedVersionId],
    ["Commits", commits.length || null],
    ["Changed files", changes.length || null],
    ["Discussion threads", humanDiscussions.length || null],
    ["Timeline events", timelineEntries.length || null],
    ["URL", overview.web_url]
  ];

  for (const [label, value] of facts) {
    if (value === null || value === undefined || value === "") {
      continue;
    }
    lines.push(`- ${label}: ${value}`);
  }

  if (commits.length > 0) {
    lines.push("");
    lines.push("## Commits");
    lines.push("");
    for (const commit of commits) {
      const bits = [commit.short_id || commit.id || "unknown", commit.title || "(untitled)"];
      if (commit.author_name) {
        bits.push(`author=${commit.author_name}`);
      }
      if (commit.created_at) {
        bits.push(`created=${commit.created_at}`);
      }
      lines.push(`- ${bits.join(" | ")}`);
    }
  }

  if (changes.length > 0) {
    lines.push("");
    lines.push("## Changed Files");
    lines.push("");
    for (const change of changes.slice(0, 5)) {
      lines.push(`- ${change.new_path || change.old_path || "(unknown path)"}`);
    }
  }

  if (humanDiscussions.length > 0) {
    lines.push("");
    lines.push("## Recent Human Interactions");
    lines.push("");
    for (const discussion of humanDiscussions.slice(0, 3)) {
      const firstNote = discussion.notes[0];
      const author = firstNote.author?.username || firstNote.author?.name || "unknown";
      const createdAt = firstNote.created_at || "unknown time";
      lines.push(`- ${author} @ ${createdAt}: ${summarizeText(firstNote.body)}`);
    }
  }

  if (overview.description) {
    lines.push("");
    lines.push("## Description");
    lines.push("");
    lines.push(String(overview.description).trim());
  }

  return lines.join("\n");
}

function renderChangesMarkdown(changesResult, options) {
  const sanitized = anonymizeForOutput(changesResult);
  const lines = [`# Changes for ${options.project}!${options.mr}`, ""];

  if (sanitized.version?.id !== undefined) {
    lines.push(`- Version: ${sanitized.version.id}`);
    lines.push("");
  }

  if (!sanitized.changes.length) {
    lines.push("No changed files.");
    return lines.join("\n");
  }

  const artifacts = buildChangeArtifacts(sanitized.changes);
  const grouped = groupArtifactsByDirectory(artifacts);

  lines.push("## File Tree");
  lines.push("");

  for (const group of grouped) {
    lines.push(`### ${group.directory}`);
    lines.push("");
    for (const artifact of group.artifacts) {
      const statusBits = [artifact.change_type];
      if (!artifact.has_diff) {
        statusBits.push("diff unavailable");
      }
      lines.push(`- [${artifact.path}](${artifact.artifact}) | ${statusBits.join(" | ")}`);
    }
    lines.push("");
  }

  return trimTrailingBlankLines(lines).join("\n");
}

function normalizeSnapshotDatasets(include) {
  const requested = new Set(include?.length ? include : DEFAULT_SNAPSHOT_DATASETS);
  if (requested.has("patch")) {
    requested.delete("patch");
    requested.add("changes");
  }
  return requested;
}

function buildChangeArtifacts(changes) {
  return changes.map((change) => {
    const effectivePath = change.new_path || change.old_path || "(unknown path)";
    const artifact = `${CHANGE_ARTIFACT_ROOT}/${encodeArtifactName(effectivePath)}.md`;
    return {
      path: effectivePath,
      old_path: change.old_path || null,
      new_path: change.new_path || null,
      change_type: inferChangeType(change),
      artifact,
      has_diff: Boolean(change.diff),
      collapsed: change.collapsed,
      too_large: change.too_large,
      generated_file: change.generated_file,
      content: renderChangeArtifactMarkdown(change, effectivePath)
    };
  });
}

function inferChangeType(change) {
  if (change.renamed_file) {
    return "renamed";
  }
  if (change.deleted_file) {
    return "deleted";
  }
  if (change.new_file) {
    return "added";
  }
  return "modified";
}

async function writeChangeArtifacts(outputDir, artifacts) {
  await fs.mkdir(path.join(outputDir, CHANGE_ARTIFACT_ROOT), { recursive: true });
  for (const artifact of artifacts) {
    const targetPath = path.join(outputDir, artifact.artifact);
    await writeMarkdown(targetPath, artifact.content);
  }
}

function renderChangeArtifactMarkdown(change, effectivePath) {
  const sanitized = anonymizeForOutput(change);
  const lines = [`# ${effectivePath}`, ""];
  lines.push(`- Change type: ${inferChangeType(sanitized)}`);
  lines.push(`- Old path: ${sanitized.old_path || "(none)"}`);
  lines.push(`- New path: ${sanitized.new_path || "(none)"}`);
  lines.push(`- New file: ${sanitized.new_file ? "yes" : "no"}`);
  lines.push(`- Deleted file: ${sanitized.deleted_file ? "yes" : "no"}`);
  lines.push(`- Renamed file: ${sanitized.renamed_file ? "yes" : "no"}`);
  if (sanitized.generated_file !== undefined) {
    lines.push(`- Generated file: ${sanitized.generated_file ? "yes" : "no"}`);
  }
  if (sanitized.collapsed !== undefined) {
    lines.push(`- Collapsed: ${sanitized.collapsed ? "yes" : "no"}`);
  }
  if (sanitized.too_large !== undefined) {
    lines.push(`- Too large: ${sanitized.too_large ? "yes" : "no"}`);
  }

  if (sanitized.diff) {
    lines.push("");
    lines.push("## Diff");
    lines.push("");
    lines.push("```diff");
    lines.push(String(sanitized.diff).trimEnd());
    lines.push("```");
  } else if (sanitized.too_large) {
    lines.push("");
    lines.push("Diff unavailable: GitLab marked this diff as too large.");
  } else if (sanitized.collapsed) {
    lines.push("");
    lines.push("Diff unavailable: GitLab returned this diff in collapsed form.");
  } else {
    lines.push("");
    lines.push("Diff unavailable.");
  }

  return lines.join("\n");
}

function groupArtifactsByDirectory(artifacts) {
  const groups = new Map();
  for (const artifact of artifacts) {
    const directory = path.posix.dirname(artifact.path);
    const key = directory === "." ? "(root)" : directory;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(artifact);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([directory, entries]) => ({
      directory,
      artifacts: entries.sort((left, right) => left.path.localeCompare(right.path))
    }));
}

function encodeArtifactName(filePath) {
  return filePath
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => segment.replace(/[^A-Za-z0-9._-]/g, "_"))
    .join("__");
}

function renderTimelineMarkdown(discussions, options) {
  const sanitized = selectTimelineDiscussions(anonymizeForOutput(discussions));
  const lines = [`# Timeline for ${options.project}!${options.mr}`, ""];

  if (!sanitized.length) {
    lines.push("No timeline events.");
    return lines.join("\n");
  }

  for (const discussion of sanitized) {
    lines.push(`## Event ${discussion.id || "(unknown)"}`);
    lines.push("");

    for (const note of discussion.notes || []) {
      const author = note.author?.username || note.author?.name || "unknown";
      lines.push(`- ${author} @ ${note.created_at || "unknown time"}`);
      if (note.body) {
        lines.push("");
        lines.push(indentMarkdownBlock(String(note.body).trim(), "  "));
        lines.push("");
      }
    }
  }

  return trimTrailingBlankLines(lines).join("\n");
}

function indentMarkdownBlock(text, prefix) {
  return text
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function trimTrailingBlankLines(lines) {
  const next = [...lines];
  while (next.length > 0 && next[next.length - 1] === "") {
    next.pop();
  }
  return next;
}

function extractTaskId(title, pattern) {
  if (!title || !pattern) {
    return null;
  }

  let regex;
  try {
    regex = new RegExp(pattern, "u");
  } catch {
    return null;
  }

  const match = String(title).match(regex);
  if (!match) {
    return null;
  }

  return match[1] || match[0] || null;
}

function selectHumanDiscussions(discussions) {
  return discussions
    .map((discussion) => ({
      ...discussion,
      notes: (discussion.notes || []).filter((note) => !note.system)
    }))
    .filter((discussion) => discussion.notes.length > 0);
}

function selectTimelineDiscussions(discussions) {
  return discussions
    .map((discussion) => ({
      ...discussion,
      notes: (discussion.notes || []).filter((note) => note.system)
    }))
    .filter((discussion) => discussion.notes.length > 0);
}

function summarizeText(value, maxLength = 100) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return "(empty)";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}...`;
}
