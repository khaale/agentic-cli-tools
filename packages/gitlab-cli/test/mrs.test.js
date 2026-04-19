import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getMergeRequestChanges, listMergeRequests, snapshotMergeRequest } from "../src/commands/mrs.js";

test("mrs list uses the project merge requests endpoint and compact schema", async () => {
  const calls = [];
  const client = {
    requestAllPages: async (apiPath, options) => {
      calls.push({ apiPath, options });
      return [
        {
          id: 44,
          iid: 12,
          title: "Tighten retries",
          state: "opened",
          author: { username: "aleks" },
          source_branch: "feature/retries",
          target_branch: "main",
          updated_at: "2026-04-03T10:00:00Z",
          detailed_merge_status: "mergeable",
          web_url: "https://gitlab.example.com/platform/api/-/merge_requests/12"
        }
      ];
    },
    projectPath: (project) => `/api/v4/projects/${encodeURIComponent(project)}`,
    groupPath: (group) => `/api/v4/groups/${encodeURIComponent(group)}`
  };

  const result = await listMergeRequests(client, {
    project: "platform/api",
    state: "opened",
    limit: 5
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].apiPath, "/api/v4/projects/platform%2Fapi/merge_requests");
  assert.equal(calls[0].options.query.state, "opened");
  assert.deepEqual(
    [
      {
        ...result.data[0],
        author: undefined
      }
    ],
    [
      {
        id: 44,
        iid: 12,
        project: "platform/api",
        title: "Tighten retries",
        state: "opened",
        draft: false,
        source_branch: "feature/retries",
        target_branch: "main",
        updated_at: "2026-04-03T10:00:00Z",
        merge_status: "mergeable",
        web_url: "https://gitlab.example.com/platform/api/-/merge_requests/12",
        author: undefined
      }
    ]
  );
  assert.match(result.data[0].author, /^sha256:[a-f0-9]{12}$/);
});

test("mrs changes resolves latest version before loading version-specific diffs", async () => {
  const calls = [];
  const client = {
    requestJson: async (apiPath) => {
      calls.push(apiPath);
      if (apiPath.endsWith("/versions")) {
        return [
          {
            id: 10,
            head_commit_sha: "head-1",
            base_commit_sha: "base-1",
            start_commit_sha: "start-1",
            created_at: "2026-04-03T10:00:00Z",
            real_size: "4"
          },
          {
            id: 9,
            head_commit_sha: "head-0",
            base_commit_sha: "base-0",
            start_commit_sha: "start-0",
            created_at: "2026-04-03T09:00:00Z",
            real_size: "3"
          }
        ];
      }

      assert.equal(apiPath, "/api/v4/projects/platform%2Fapi/merge_requests/12/versions/10");
      return {
        id: 10,
        head_commit_sha: "head-1",
        base_commit_sha: "base-1",
        start_commit_sha: "start-1",
        created_at: "2026-04-03T10:00:00Z",
        real_size: "4",
        diffs: [
          {
            old_path: "src/old.js",
            new_path: "src/new.js",
            renamed_file: true,
            deleted_file: false,
            new_file: false,
            diff: "@@ -1 +1 @@"
          }
        ]
      };
    },
    projectPath: (project) => `/api/v4/projects/${encodeURIComponent(project)}`
  };

  const result = await getMergeRequestChanges(client, {
    project: "platform/api",
    mr: "12"
  });

  assert.deepEqual(calls, [
    "/api/v4/projects/platform%2Fapi/merge_requests/12/versions",
    "/api/v4/projects/platform%2Fapi/merge_requests/12/versions/10"
  ]);
  assert.equal(result.data.version.id, 10);
  assert.deepEqual(result.data.changes, [
    {
      old_path: "src/old.js",
      new_path: "src/new.js",
      renamed_file: true,
      deleted_file: false,
      new_file: false
    }
  ]);
});

test("mrs snapshot writes markdown datasets by default and anonymizes identities", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glc-mr-snapshot-"));
  const outputDir = path.join(root, "snapshot");
  const client = {
    requestJson: async (apiPath) => {
      if (apiPath.endsWith("/merge_requests/12")) {
        return {
          iid: 12,
          title: "[#75295] Tighten retries",
          author: {
            id: 338,
            username: "aleks",
            name: "Aleksander"
          }
        };
      }

      if (apiPath.endsWith("/versions")) {
        return [
          {
            id: 10,
            head_commit_sha: "head-1",
            base_commit_sha: "base-1",
            start_commit_sha: "start-1",
            created_at: "2026-04-03T10:00:00Z",
            real_size: "4"
          }
        ];
      }

      if (apiPath.endsWith("/versions/10")) {
        return {
          id: 10,
          head_commit_sha: "head-1",
          base_commit_sha: "base-1",
          start_commit_sha: "start-1",
          created_at: "2026-04-03T10:00:00Z",
          real_size: "4",
          diffs: [
            {
              old_path: "src/old.js",
              new_path: "src/new.js",
              renamed_file: false,
              deleted_file: false,
              new_file: true,
              generated_file: false,
              diff: "@@ -0,0 +1 @@\n+value"
            }
          ]
        };
      }

      throw new Error(`unexpected apiPath: ${apiPath}`);
    },
    requestAllPages: async (apiPath) => {
      if (apiPath.endsWith("/commits")) {
        return [{ id: "abc", short_id: "abc", title: "Commit", author_name: "Aleksander" }];
      }

      if (apiPath.endsWith("/discussions")) {
        return [
          {
            id: "discussion-system",
            individual_note: true,
            resolved: false,
            notes: [
              {
                id: 0,
                body: "assigned to @aleks",
                created_at: "2026-04-03T10:30:00Z",
                system: true,
                author: {
                  id: 338,
                  username: "aleks",
                  name: "Aleksander"
                }
              }
            ]
          },
          {
            id: "discussion-1",
            resolved: false,
            notes: [
              {
                id: 1,
                body: "Requested review from @aleks. Please tighten the retry logic.",
                created_at: "2026-04-03T11:00:00Z",
                system: false,
                author: {
                  id: 338,
                  username: "aleks",
                  name: "Aleksander"
                }
              }
            ]
          }
        ];
      }

      throw new Error(`unexpected paged apiPath: ${apiPath}`);
    },
    projectPath: (project) => `/api/v4/projects/${encodeURIComponent(project)}`
  };

  const result = await snapshotMergeRequest(client, {
    project: "platform/api",
    mr: "12",
    outputDir
  });

  assert.equal(result.data.selected_version_id, 10);

  const manifest = JSON.parse(await fs.readFile(path.join(outputDir, "manifest.json"), "utf8"));
  const overview = await fs.readFile(path.join(outputDir, "overview.md"), "utf8");
  const timeline = await fs.readFile(path.join(outputDir, "timeline.md"), "utf8");
  const changes = await fs.readFile(path.join(outputDir, "changes.md"), "utf8");
  const fileChange = await fs.readFile(path.join(outputDir, "changes", "src", "new.js"), "utf8");

  assert.deepEqual(manifest.datasets, ["overview", "discussions", "changes", "commits"]);
  assert.equal(manifest.selected_version_id, 10);
  assert.equal(manifest.task_id, "75295");
  assert.deepEqual(result.data.files, [
    "manifest.json",
    "overview.md",
    "timeline.md",
    "changes.md",
    "changes/src/new.js"
  ]);
  assert.deepEqual(manifest.changed_files, [
    {
      path: "src/new.js",
      old_path: "src/old.js",
      new_path: "src/new.js",
      change_type: "added",
      artifact: "changes/src/new.js",
      has_diff: true,
      generated_file: false
    }
  ]);
  assert.match(overview, /# Merge Request !12: \[#75295\] Tighten retries/);
  assert.match(overview, /- Task ID: 75295/);
  assert.match(overview, /- Commits: 1/);
  assert.match(overview, /- Changed files: 1/);
  assert.match(overview, /- Discussion threads: 1/);
  assert.match(overview, /- Timeline events: 1/);
  assert.match(overview, /## Commits/);
  assert.match(overview, /author=sha256:[a-f0-9]{12}/);
  assert.match(overview, /## Changed Files/);
  assert.match(overview, /## Recent Human Interactions/);
  assert.match(overview, /Requested review from @sha256:[a-f0-9]{12}\. Please tighten the retry logic\./);
  assert.match(overview, /sha256:[a-f0-9]{12}/);
  assert.doesNotMatch(overview, /Aleksander|aleks/);
  assert.match(timeline, /# Timeline for platform\/api!12/);
  assert.match(timeline, /assigned to @sha256:[a-f0-9]{12}/);
  assert.doesNotMatch(timeline, /Requested review from/);
  assert.match(changes, /# Changes for platform\/api!12/);
  assert.match(changes, /## File Tree/);
  assert.match(changes, /\[src\/new\.js\]\(changes\/src\/new\.js\) \| added/);
  assert.match(fileChange, /@@ -0,0 \+1 @@/);
  assert.match(fileChange, /\+value/);
});

test("mrs snapshot normalizes patch dataset into per-file change artifacts", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glc-mr-snapshot-"));
  const outputDir = path.join(root, "snapshot");
  const client = {
    requestJson: async (apiPath) => {
      if (apiPath.endsWith("/versions")) {
        return [
          {
            id: 10,
            head_commit_sha: "head-1",
            base_commit_sha: "base-1",
            start_commit_sha: "start-1",
            created_at: "2026-04-03T10:00:00Z",
            real_size: "4"
          }
        ];
      }

      if (apiPath.endsWith("/versions/10")) {
        return {
          id: 10,
          diffs: [
            {
              old_path: "src/old.js",
              new_path: "src/new.js",
              renamed_file: false,
              deleted_file: false,
              new_file: true,
              diff: "@@ -0,0 +1 @@\n+value"
            }
          ]
        };
      }

      if (apiPath.endsWith("/merge_requests/12")) {
        return {
          iid: 12,
          title: "Tighten retries",
          author: {
            username: "aleks"
          }
        };
      }

      throw new Error(`unexpected apiPath: ${apiPath}`);
    },
    requestAllPages: async (apiPath) => {
      if (apiPath.endsWith("/pipelines")) {
        return [{ id: 12, status: "success" }];
      }

      throw new Error(`unexpected paged apiPath: ${apiPath}`);
    },
    projectPath: (project) => `/api/v4/projects/${encodeURIComponent(project)}`
  };

  await snapshotMergeRequest(client, {
    project: "platform/api",
    mr: "12",
    include: ["overview", "pipelines", "patch"],
    outputDir
  });

  const overview = await fs.readFile(path.join(outputDir, "overview.md"), "utf8");
  const pipelines = JSON.parse(await fs.readFile(path.join(outputDir, "pipelines.json"), "utf8"));
  const changes = await fs.readFile(path.join(outputDir, "changes.md"), "utf8");
  const fileChange = await fs.readFile(path.join(outputDir, "changes", "src", "new.js"), "utf8");
  const manifest = JSON.parse(await fs.readFile(path.join(outputDir, "manifest.json"), "utf8"));

  assert.match(overview, /sha256:[a-f0-9]{12}/);
  assert.equal(pipelines[0].status, "success");
  assert.deepEqual(manifest.datasets, ["overview", "pipelines", "changes"]);
  assert.match(changes, /\[src\/new\.js\]\(changes\/src\/new\.js\)/);
  assert.match(fileChange, /\+value/);
});

test("mrs snapshot uses configured task id pattern when provided", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glc-mr-snapshot-"));
  const outputDir = path.join(root, "snapshot");
  const client = {
    requestJson: async (apiPath) => {
      if (apiPath.endsWith("/merge_requests/12")) {
        return {
          iid: 12,
          title: "TASK-99881 Tighten retries"
        };
      }

      if (apiPath.endsWith("/versions")) {
        return [{ id: 10, created_at: "2026-04-03T10:00:00Z" }];
      }

      if (apiPath.endsWith("/versions/10")) {
        return {
          id: 10,
          diffs: []
        };
      }

      throw new Error(`unexpected apiPath: ${apiPath}`);
    },
    requestAllPages: async (apiPath) => {
      if (apiPath.endsWith("/commits") || apiPath.endsWith("/discussions")) {
        return [];
      }

      throw new Error(`unexpected paged apiPath: ${apiPath}`);
    },
    projectPath: (project) => `/api/v4/projects/${encodeURIComponent(project)}`
  };

  await snapshotMergeRequest(client, {
    project: "platform/api",
    mr: "12",
    outputDir,
    taskIdPattern: "TASK-(\\d+)"
  });

  const manifest = JSON.parse(await fs.readFile(path.join(outputDir, "manifest.json"), "utf8"));
  assert.equal(manifest.task_id, "99881");
});

test("mrs snapshot writes explicit unavailable notes for collapsed and too-large diffs", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glc-mr-snapshot-"));
  const outputDir = path.join(root, "snapshot");
  const client = {
    requestJson: async (apiPath) => {
      if (apiPath.endsWith("/merge_requests/12")) {
        return {
          iid: 12,
          title: "Tighten retries"
        };
      }

      if (apiPath.endsWith("/versions")) {
        return [{ id: 10, created_at: "2026-04-03T10:00:00Z" }];
      }

      if (apiPath.endsWith("/versions/10")) {
        return {
          id: 10,
          diffs: [
            {
              old_path: "src/old.js",
              new_path: "src/renamed.js",
              renamed_file: true,
              deleted_file: false,
              new_file: false,
              collapsed: true
            },
            {
              old_path: "docs/large.md",
              new_path: "docs/large.md",
              renamed_file: false,
              deleted_file: false,
              new_file: false,
              too_large: true
            }
          ]
        };
      }

      throw new Error(`unexpected apiPath: ${apiPath}`);
    },
    requestAllPages: async (apiPath) => {
      if (apiPath.endsWith("/commits") || apiPath.endsWith("/discussions")) {
        return [];
      }

      throw new Error(`unexpected paged apiPath: ${apiPath}`);
    },
    projectPath: (project) => `/api/v4/projects/${encodeURIComponent(project)}`
  };

  await snapshotMergeRequest(client, {
    project: "platform/api",
    mr: "12",
    outputDir
  });

  const changes = await fs.readFile(path.join(outputDir, "changes.md"), "utf8");
  const renamedChange = await fs.readFile(path.join(outputDir, "changes", "src", "renamed.js"), "utf8");
  const largeChange = await fs.readFile(path.join(outputDir, "changes", "docs", "large.md"), "utf8");
  const manifest = JSON.parse(await fs.readFile(path.join(outputDir, "manifest.json"), "utf8"));

  assert.match(changes, /\[src\/renamed\.js\]\(changes\/src\/renamed\.js\) \| renamed \| diff unavailable/);
  assert.match(changes, /\[docs\/large\.md\]\(changes\/docs\/large\.md\) \| modified \| diff unavailable/);
  assert.match(renamedChange, /\[Diff unavailable: GitLab returned this diff in collapsed form\.\]/);
  assert.match(largeChange, /\[Diff unavailable: GitLab marked this diff as too large\.\]/);
  assert.deepEqual(manifest.changed_files, [
    {
      path: "src/renamed.js",
      old_path: "src/old.js",
      new_path: "src/renamed.js",
      change_type: "renamed",
      artifact: "changes/src/renamed.js",
      has_diff: false,
      collapsed: true
    },
    {
      path: "docs/large.md",
      old_path: "docs/large.md",
      new_path: "docs/large.md",
      change_type: "modified",
      artifact: "changes/docs/large.md",
      has_diff: false,
      too_large: true
    }
  ]);
});
