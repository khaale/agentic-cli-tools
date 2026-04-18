# `glc` Merge Requests Design And Implementation Plan

## Status

Proposal for adding first-class merge request support to `glc` with a more precise, agent-friendly review flow.

## Problem

`glc` currently covers groups, projects, repositories, pipelines, jobs, and cache management, but it does not expose merge requests as a first-class resource. That makes MR-centric workflows awkward for both shell users and LLM agents:

- listing recent MRs requires leaving `glc`
- review context is spread across multiple GitLab APIs
- the exact review target is ambiguous when an MR changes after initial inspection
- large MR payloads are hard to fit into model context without deliberate shaping

The goal is to add MR support in a way that stays consistent with `glc`'s current design:

- resource-first commands
- explicit selectors
- brief default output
- full payloads only when explicitly requested
- cache-backed reads
- machine-friendly stdout

## Product Goals

- List the latest MRs with precise filtering for `opened`, `merged`, or `all`.
- Inspect a single MR through small, composable reads: overview, commits, pipelines, changes, and diff versions.
- Let agents pin review work to a specific diff version instead of reviewing a moving target.
- Support an explicit "review pack" or snapshot flow that writes MR data to the filesystem when that is better for context management than returning one large payload on stdout.
- Preserve the current CLI style and avoid introducing hidden state or session-dependent behavior.

## Non-Goals

- Creating, updating, or merging MRs.
- Inline code review comments posted back to GitLab.
- A single giant "do everything" endpoint that always loads all MR data by default.
- Implicit repository context derived from the current working tree.

## Proposed CLI Surface

Add a new top-level resource:

```text
glc mrs <verb> [flags]
```

Initial verbs:

```text
glc mrs list
glc mrs get
glc mrs commits
glc mrs pipelines
glc mrs versions
glc mrs changes
glc mrs snapshot
```

Selectors:

- `--project <path-with-namespace>` for all MR-specific reads
- `--mr <iid>` as the primary MR selector
- `--group <full-path>` for group-scoped MR listing
- `--version <id|latest>` for version-pinned change inspection

Additional control flags:

- `--state <opened|merged|all>`
- `--author <username>`
- `--target-branch <name>`
- `--source-branch <name>`
- `--patch` to include patch text in `changes`
- `--with <dataset[,dataset...]>` for small bundled reads on `get`
- `--include <dataset[,dataset...]>` for `snapshot`
- `--output-dir <path>` for `snapshot`

## Command Semantics

### `glc mrs list`

Purpose:

- show the latest merge requests in a project or group
- allow stable filtering without pulling full MR payloads

Examples:

```bash
glc mrs list --project platform/api --state opened --limit 20
glc mrs list --project platform/api --state merged --limit 20
glc mrs list --group platform --state all --limit 50
```

Default summary schema:

- `id`
- `iid`
- `project`
- `title`
- `state`
- `draft`
- `author`
- `source_branch`
- `target_branch`
- `updated_at`
- `merge_status`
- `web_url`

Notes:

- `list` should default to descending recency, using GitLab ordering that matches "latest MR" expectations.
- `--state all` should map to GitLab's `all`, not to a local union of multiple requests.

### `glc mrs get`

Purpose:

- inspect a single MR overview without loading all changes by default

Example:

```bash
glc mrs get --project platform/api --mr 123
glc mrs get --project platform/api --mr 123 --with pipelines,versions
```

Default payload:

- MR overview fields only
- no full diff text
- no commit list unless explicitly requested

Recommended bundled datasets for `--with`:

- `pipelines`
- `versions`
- `commits`
- `changes`

This keeps the command composable while still allowing a small number of common combined reads.

### `glc mrs commits`

Purpose:

- list commits associated with one MR in a compact schema

Example:

```bash
glc mrs commits --project platform/api --mr 123
```

Default summary schema:

- `id`
- `short_id`
- `title`
- `author_name`
- `created_at`

### `glc mrs pipelines`

Purpose:

- list pipelines attached to the MR, not just pipelines for the branch

Example:

```bash
glc mrs pipelines --project platform/api --mr 123
```

Default summary schema:

- `id`
- `iid`
- `sha`
- `ref`
- `status`
- `source`
- `web_url`
- `created_at`
- `updated_at`

Important design choice:

- use the MR-specific pipelines endpoint so detached pipelines and merged-result pipelines are represented correctly

### `glc mrs versions`

Purpose:

- show diff versions for the MR so review can be pinned to a stable target

Example:

```bash
glc mrs versions --project platform/api --mr 123
```

Default summary schema:

- `id`
- `head_commit_sha`
- `base_commit_sha`
- `start_commit_sha`
- `created_at`
- `real_size`

Important design choice:

- this command is central to "precision"
- review should target a selected version whenever possible, not an implicitly moving MR head

### `glc mrs changes`

Purpose:

- inspect changed files for a selected MR version

Examples:

```bash
glc mrs changes --project platform/api --mr 123
glc mrs changes --project platform/api --mr 123 --version latest
glc mrs changes --project platform/api --mr 123 --version 456 --patch
```

Default output should be a compact changed-file summary:

- `old_path`
- `new_path`
- `renamed_file`
- `deleted_file`
- `new_file`
- `generated_file` when available
- `too_large` when available

Patch text should be opt-in:

- `--patch` includes diff text
- when `--patch` is omitted, return metadata only

Important design choices:

- `changes` should support `--version latest` and `--version <id>`
- defaulting to metadata-only helps keep stdout usable for agents and shell pipelines
- patch text is often better loaded into a snapshot on disk than pushed directly into model context

### `glc mrs snapshot`

Purpose:

- materialize a review pack on disk for agentic review
- separate cache concerns from review-context preparation

Example:

```bash
glc mrs snapshot \
  --project platform/api \
  --mr 123 \
  --version latest \
  --include overview,commits,pipelines,versions,changes \
  --output-dir /tmp/glc-mr-123
```

Suggested output layout:

```text
/tmp/glc-mr-123/
  manifest.json
  overview.md
  timeline.md
  pipelines.json
  versions.json
  changes.md
  changes/
    src__main__java__com__example__App.java.md
    pom.xml.md
```

`manifest.json` should include:

- project path
- MR iid
- selected version id
- selected datasets
- generation timestamp
- generated file list
- `changed_files[]` entries with:
  - effective repo path
  - old path
  - new path
  - change type
  - per-file artifact path
  - diff availability flags such as `collapsed` and `too_large`

Important design choices:

- `snapshot` is explicit and separate from normal cache files
- output should be deterministic and easy for agents to consume
- the snapshot command should not mutate Git state or require a local clone
- per-file artifacts are flat on disk even when repo paths are deeply nested
- tree-like repo navigation belongs in `changes.md`, not in the output directory layout

## Review Flow

The intended agentic flow should look like this:

### 1. Discover candidate MRs

```bash
glc mrs list --project platform/api --state opened --limit 20
```

### 2. Inspect one MR overview

```bash
glc mrs get --project platform/api --mr 123
```

### 3. Pin the review target

```bash
glc mrs versions --project platform/api --mr 123
```

Choose one diff version, usually `latest`.

### 4. Load review datasets deliberately

```bash
glc mrs commits --project platform/api --mr 123
glc mrs pipelines --project platform/api --mr 123
glc mrs changes --project platform/api --mr 123 --version latest
```

### 5. Materialize a review pack when needed

```bash
glc mrs snapshot --project platform/api --mr 123 --version latest --include overview,commits,pipelines,changes --output-dir /tmp/glc-mr-123
```

### 6. Review against the pinned version

The reviewing agent should consume the snapshot or the explicitly fetched datasets, not implicitly review the live MR head after additional pushes.

## Data Model And Precision Rules

### Primary identifiers

- project identity should continue to use `path_with_namespace`
- MR identity should use `iid` at the CLI layer and `id` only as a secondary field

This matches GitLab UX and avoids cross-project ambiguity when the project is already explicit.

### Precision rules

- `get` is overview-first
- `commits`, `pipelines`, `versions`, and `changes` are separate reads
- `changes` without `--version` should default to `latest`, but the resolved version should be surfaced in output
- `snapshot` should always record the resolved version id in its manifest
- patch text is opt-in for command output
- snapshot change bundles should always fetch real diff text for per-file artifacts

### Combined reads

Some data can be combined safely when the user asks for it explicitly:

- `get --with pipelines,versions`
- `get --with commits`

Some data should remain explicit because of size or volatility:

- patch text
- large changed-file lists
- full before/after file contents

## API Mapping

Expected GitLab API families:

- list project merge requests
- list group merge requests
- get one merge request
- list merge request commits
- list merge request pipelines
- list merge request diff versions
- get merge request changes for a selected version or equivalent diff payload

Implementation should keep endpoint selection inside the command layer and continue to use `GitLabClient` as the only HTTP abstraction boundary.

Snapshot-specific rule:

- resolve the selected version first, then fetch `.../merge_requests/:iid/versions/:version_id?unidiff=true`
- use that diff payload to generate one per-file Markdown artifact per changed file

## Caching Strategy

The existing file cache is a good fit for MR API reads, but MR data needs more intentional freshness rules.

Recommended TTL defaults:

- MR list and overview: 5 minutes
- MR pipelines: 5 to 10 minutes
- MR versions: 5 minutes
- MR changes metadata: 5 minutes
- MR patch text: 5 minutes, but only if requested

Cache scope keys should include:

- `resource: "mrs"`
- `project`
- `group` when relevant
- `mr`
- `version` when relevant
- dataset name such as `overview`, `commits`, `pipelines`, `versions`, `changes`

Important distinction:

- cache is for API response reuse
- snapshot is for review-pack materialization

They should remain separate mechanisms.

## Output Design

Follow the existing `glc` conventions:

- `list` commands default to JSONL
- `get` commands default to JSON
- snapshot metadata can return JSON while writing files to disk

Output guidelines:

- default schemas should be compact and stable
- `--full` should return the full GitLab payload for expert use
- `--fields` and `--jq` should continue to work on MR resources
- raw patch output should be available only when explicitly requested
- snapshot output should favor agent navigation over mirroring repository directories on disk
- `changes.md` should provide the tree-like overview of changed files

## Implementation Plan

### Phase 1: Resource foundation

Add first-class MR support with precise diff-version handling.

Scope:

- add `mrs` resource wiring in `src/cli.js`
- add `src/commands/mrs.js`
- add MR summarizers in `src/lib/schemas.js`
- add support for `--mr`, `--version`, and `--with`
- implement `list`, `get`, `versions`, and `changes`
- document the new resource in `README.md` and `docs/design.md`

Important prerequisite:

- refactor list-query generation so MR `state` is not incorrectly mapped through the current generic `status` behavior

### Phase 2: Full review datasets

Scope:

- implement `commits`
- implement `pipelines`
- add compact MR commit and MR pipeline schemas
- add MR-specific cache scope metadata
- expand docs and shell recipes

### Phase 3: Agentic review pack

Scope:

- implement `snapshot`
- write deterministic review-pack files to `--output-dir`
- include resolved version metadata in the manifest
- allow selective dataset inclusion through `--include`
- write one flat per-file artifact under `changes/` for each changed path
- render `changes.md` as a grouped tree-like index that links to those artifacts

### Phase 4: Optional deeper review context

Possible additions:

- export base and head file contents for changed files
- add approval-state inspection if needed for reviewer workflows
- add tree-like MR overview output if that proves useful

These should stay optional because they can grow context size quickly.

## File-Level Impact

Expected files to change:

- `src/cli.js`
- `src/lib/argv.js`
- `src/lib/gitlab.js`
- `src/lib/schemas.js`
- `src/commands/mrs.js`
- `README.md`
- `docs/design.md`
- `SKILL.md`
- new tests under `test/`

Likely new tests:

- `test/mrs.test.js`

Existing tests that should be extended:

- `test/cli.test.js`
- `test/gitlab.test.js`
- `test/schemas.test.js`
- `test/cache.test.js`

## Testing Plan

### Unit tests

- CLI help includes the new `mrs` resource and verbs
- argument parsing accepts `--mr`, `--version`, `--with`, `--include`, and `--output-dir`
- MR summarizers return compact stable schemas
- MR command handlers hit the expected GitLab API paths
- list and get commands preserve output mode conventions

### Behavior tests

- `mrs list --state opened|merged|all` maps correctly to GitLab queries
- `mrs changes --version latest` resolves and reports the selected version
- `mrs changes --patch` includes diff text while default output does not
- `mrs snapshot` writes the expected manifest and dataset files
- `mrs snapshot` writes flat per-file artifacts and tree-like navigation in `changes.md`
- `mrs snapshot` records unavailable diff states such as `collapsed` and `too_large`

### Regression tests

- existing non-MR resources continue to behave the same
- generic list-query refactors do not break pipelines, jobs, groups, or projects

## Open Questions

- Whether `changes` should fetch through a dedicated version endpoint when available, or resolve `latest` and use the most precise endpoint GitLab exposes for that version.
- Whether approval-state data belongs in the initial MR surface or should wait for a later phase.

## Recommendation

Implement this in phases, but start with the pieces that establish precision:

1. `mrs list`
2. `mrs get`
3. `mrs versions`
4. `mrs changes --version <id|latest>`

That gives `glc` a solid MR inspection story quickly and creates the right base for agentic review snapshots afterward.
