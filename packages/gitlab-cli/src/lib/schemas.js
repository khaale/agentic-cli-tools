import { anonymizeIdentity } from "./anonymize.js";

export function summarizeGroup(group) {
  return {
    id: group.id,
    path: group.path,
    path_with_namespace: group.full_path,
    web_url: group.web_url
  };
}

export function summarizeMergeRequest(mergeRequest, projectPath) {
  return {
    id: mergeRequest.id,
    iid: mergeRequest.iid,
    project: projectPath || inferProjectPath(mergeRequest) || null,
    title: mergeRequest.title,
    state: mergeRequest.state,
    draft: mergeRequest.draft ?? mergeRequest.work_in_progress ?? false,
    author: anonymizeIdentity(mergeRequest.author?.username ?? mergeRequest.author?.name ?? null),
    source_branch: mergeRequest.source_branch,
    target_branch: mergeRequest.target_branch,
    updated_at: mergeRequest.updated_at,
    merge_status: mergeRequest.detailed_merge_status || mergeRequest.merge_status || null,
    web_url: mergeRequest.web_url
  };
}

export function summarizeProject(project) {
  return {
    id: project.id,
    path: project.path,
    path_with_namespace: project.path_with_namespace,
    web_url: project.web_url,
    ssh_url_to_repo: project.ssh_url_to_repo,
    http_url_to_repo: project.http_url_to_repo,
    last_activity_at: project.last_activity_at,
  };
}

export function summarizeMrCommit(commit) {
  return {
    id: commit.id,
    short_id: commit.short_id,
    title: commit.title,
    author_name: anonymizeIdentity(commit.author_name),
    created_at: commit.created_at
  };
}

export function summarizePipeline(pipeline, projectPath) {
  return {
    id: pipeline.id,
    project: projectPath,
    ref: pipeline.ref,
    status: pipeline.status,
    source: pipeline.source,
    sha: pipeline.sha,
    created_at: pipeline.created_at,
    web_url: pipeline.web_url
  };
}

export function summarizeMrPipeline(pipeline) {
  return {
    id: pipeline.id,
    iid: pipeline.iid,
    sha: pipeline.sha,
    ref: pipeline.ref,
    status: pipeline.status,
    source: pipeline.source,
    web_url: pipeline.web_url,
    created_at: pipeline.created_at,
    updated_at: pipeline.updated_at
  };
}

export function summarizeJob(job) {
  return {
    id: job.id,
    pipeline_id: job.pipeline?.id ?? job.pipeline_id,
    name: job.name,
    stage: job.stage,
    status: job.status,
    ref: job.ref,
    duration: job.duration,
    web_url: job.web_url
  };
}

export function summarizeMrChange(change, { patch = false } = {}) {
  const summary = {
    old_path: change.old_path,
    new_path: change.new_path,
    renamed_file: change.renamed_file || false,
    deleted_file: change.deleted_file || false,
    new_file: change.new_file || false
  };

  if (change.generated_file !== undefined) {
    summary.generated_file = change.generated_file;
  }

  if (change.too_large !== undefined) {
    summary.too_large = change.too_large;
  }

  if (change.collapsed !== undefined) {
    summary.collapsed = change.collapsed;
  }

  if (patch && change.diff !== undefined) {
    summary.diff = change.diff;
  }

  return summary;
}

export function summarizeMrVersion(version) {
  return {
    id: version.id,
    head_commit_sha: version.head_commit_sha,
    base_commit_sha: version.base_commit_sha,
    start_commit_sha: version.start_commit_sha,
    created_at: version.created_at,
    real_size: version.real_size
  };
}

export function summarizeRepoEntry(entry) {
  const summary = {
    path: entry.path,
    type: entry.type
  };

  if (entry.size !== undefined) {
    summary.size = entry.size;
  }

  return summary;
}

export function summarizeRef(ref, kind) {
  return {
    name: ref.name,
    kind,
    target: ref.target || ref.commit?.id,
    default: ref.default || false,
    protected: ref.protected || false
  };
}

function inferProjectPath(mergeRequest) {
  const reference = mergeRequest.references?.full || mergeRequest.references?.relative;
  if (!reference || !reference.includes("!")) {
    return null;
  }

  return reference.split("!")[0];
}
