# Agent-First MR Snapshot Format

## Summary

- Redesign merge request snapshots for LLM-driven review workflows.
- Keep the implementation scoped to `/Users/aleksander_khanteev/Documents/projects/khaale/agentic-cli-tools/packages/gitlab-cli`.
- Replace the old snapshot shape centered on one `changes.md` summary and optional `patch.diff` with a navigable bundle:
  - `overview.md`
  - `timeline.md` when discussions are included
  - `changes.md` as an index
  - `changes/<flat-artifact-name>.md` per changed file
  - `manifest.json`

## Goals And Audience

- Primary audience is LLM agents that need to inspect one merge request efficiently.
- Snapshots should help agents jump directly to relevant files instead of scanning one large patch stream.
- Snapshot output should stay deterministic, version-pinned, and clone-free.
- Human readability still matters, but navigation and machine-friendly structure are the main priority.

## Diff Source And Precision Rules

- Real diffs come only from the GitLab merge request version API.
- Snapshot generation must resolve `latest` to a concrete diff version before loading changes.
- The canonical API shape is:
  - `GET /projects/:id/merge_requests/:iid/versions`
  - `GET /projects/:id/merge_requests/:iid/versions/:version_id?unidiff=true`
- Do not depend on a local git checkout.
- Do not treat one aggregate patch file as the canonical review artifact.
- Preserve unified diff as the embedded diff format inside per-file documents.

## Snapshot Layout

Expected output layout:

```text
<output-dir>/
  manifest.json
  overview.md
  timeline.md
  changes.md
  changes/
    src__main__App.java.md
    pom.xml.md
```

Notes:

- `timeline.md` is written only when discussions are included.
- `changes/` is a flat artifact list on disk.
- The tree-like repository structure is rendered in `changes.md`, not encoded as nested directories.
- Artifact filenames are derived from the effective repo path using a deterministic path-safe encoding.
- There is no root `patch.diff` in the new snapshot design.

## Manifest Schema

`manifest.json` must include:

- `project`
- `mr`
- `task_id` when it can be extracted
- `selected_version_id`
- `datasets`
- `generated_at`
- `files`
- `changed_files`

Each `changed_files[]` entry must include:

- `path`
- `old_path`
- `new_path`
- `change_type` as one of `added`, `modified`, `deleted`, `renamed`
- `artifact`
- `has_diff`
- `collapsed` when available
- `too_large` when available
- `generated_file` when available

## Per-File Artifact Format

Each file artifact under `changes/` should contain:

- a title using the effective file path
- a short facts section with change type and old/new path details
- generated/collapsed/too-large markers when present
- a fenced `diff` block when diff text is available
- an explicit “diff unavailable” note when GitLab marks the diff as collapsed or too large

The artifact should not include full before/after file contents by default.

## Command Behavior

- `mrs snapshot` writes the new bundle format whenever `changes` is included.
- Snapshot `changes` is now an agent-ready changed-file bundle with real diffs.
- Snapshot generation always requests diff text for changed files.
- `mrs changes` remains compact by default on stdout.
- `mrs changes --patch` remains the explicit way to include diff text in command output.

## Edge Cases

- Deleted files use `old_path` as the artifact path key when `new_path` is missing.
- Renamed files preserve both paths and render `change_type: renamed`.
- Generated files stay visible in metadata so agents can choose to deprioritize them.
- Collapsed and too-large diffs must be called out explicitly rather than silently omitted.
