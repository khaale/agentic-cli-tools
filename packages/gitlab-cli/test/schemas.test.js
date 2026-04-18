import test from "node:test";
import assert from "node:assert/strict";
import {
  summarizeGroup,
  summarizeMergeRequest,
  summarizeMrChange,
  summarizeMrVersion,
  summarizeProject
} from "../src/lib/schemas.js";

test("summarizeGroup uses the default compact group schema", () => {
  assert.deepEqual(
    summarizeGroup({
      id: 17,
      path: "core",
      full_path: "platform/core",
      web_url: "https://gitlab.example.com/platform/core",
      visibility: "private"
    }),
    {
      id: 17,
      path: "core",
      path_with_namespace: "platform/core",
      web_url: "https://gitlab.example.com/platform/core"
    }
  );
});

test("summarizeProject uses the default compact project schema", () => {
  assert.deepEqual(
    summarizeProject({
      id: 102,
      path: "api",
      path_with_namespace: "platform/api",
      web_url: "https://gitlab.example.com/platform/api",
      ssh_url_to_repo: "git@gitlab.example.com:platform/api.git",
      http_url_to_repo: "https://gitlab.example.com/platform/api.git",
      archived: false,
      default_branch: "main",
      last_activity_at: "2026-03-19T08:10:00Z"
    }),
    {
      id: 102,
      path: "api",
      path_with_namespace: "platform/api",
      web_url: "https://gitlab.example.com/platform/api",
      ssh_url_to_repo: "git@gitlab.example.com:platform/api.git",
      http_url_to_repo: "https://gitlab.example.com/platform/api.git",
      last_activity_at: "2026-03-19T08:10:00Z"
    }
  );
});

test("summarizeMergeRequest uses the default compact MR schema", () => {
  const summary = summarizeMergeRequest({
    id: 44,
    iid: 12,
    title: "Tighten retries",
    state: "opened",
    draft: true,
    author: { username: "aleks" },
    source_branch: "feature/retries",
    target_branch: "main",
    updated_at: "2026-04-03T10:00:00Z",
    detailed_merge_status: "mergeable",
    web_url: "https://gitlab.example.com/platform/api/-/merge_requests/12",
    references: { full: "platform/api!12" }
  });

  assert.deepEqual(
    {
      ...summary,
      author: undefined
    },
    {
      id: 44,
      iid: 12,
      project: "platform/api",
      title: "Tighten retries",
      state: "opened",
      draft: true,
      source_branch: "feature/retries",
        target_branch: "main",
        updated_at: "2026-04-03T10:00:00Z",
        merge_status: "mergeable",
        web_url: "https://gitlab.example.com/platform/api/-/merge_requests/12",
        author: undefined
      }
  );
  assert.match(summary.author, /^sha256:[a-f0-9]{12}$/);
});

test("summarizeMrChange omits patch text by default", () => {
  assert.deepEqual(
    summarizeMrChange({
      old_path: "src/old.js",
      new_path: "src/new.js",
      renamed_file: true,
      deleted_file: false,
      new_file: false,
      generated_file: false,
      too_large: false,
      collapsed: true,
      diff: "@@ -1 +1 @@"
    }),
    {
      old_path: "src/old.js",
      new_path: "src/new.js",
      renamed_file: true,
      deleted_file: false,
      new_file: false,
      generated_file: false,
      too_large: false,
      collapsed: true
    }
  );
});

test("summarizeMrChange keeps patch-only fields when requested", () => {
  assert.deepEqual(
    summarizeMrChange({
      old_path: "src/old.js",
      new_path: "src/new.js",
      renamed_file: false,
      deleted_file: false,
      new_file: false,
      generated_file: true,
      too_large: false,
      collapsed: false,
      diff: "@@ -1 +1 @@\n-old\n+new"
    }, { patch: true }),
    {
      old_path: "src/old.js",
      new_path: "src/new.js",
      renamed_file: false,
      deleted_file: false,
      new_file: false,
      generated_file: true,
      too_large: false,
      collapsed: false,
      diff: "@@ -1 +1 @@\n-old\n+new"
    }
  );
});

test("summarizeMrVersion keeps version identity fields", () => {
  assert.deepEqual(
    summarizeMrVersion({
      id: 88,
      head_commit_sha: "head",
      base_commit_sha: "base",
      start_commit_sha: "start",
      created_at: "2026-04-03T09:59:00Z",
      real_size: "12"
    }),
    {
      id: 88,
      head_commit_sha: "head",
      base_commit_sha: "base",
      start_commit_sha: "start",
      created_at: "2026-04-03T09:59:00Z",
      real_size: "12"
    }
  );
});
