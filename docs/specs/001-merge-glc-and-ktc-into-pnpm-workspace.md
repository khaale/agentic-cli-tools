# Merge `glc` and `ktc` Into a `pnpm` Workspace

## Summary

- Convert this repo into a `pnpm` monorepo rooted at `/Users/aleksander_khanteev/Documents/projects/khaale/agentic-cli-tools` with a `packages/` layout.
- First phase migrates only `glc` and `kaiten-cli`; `mem`, `ws`, and other tools stay where they are for now.
- Publish the two CLIs separately as `@khaale/gitlab-cli` and `@khaale/kaiten-cli`.
- Keep the installed commands short: `glc` and `ktc` only.
- Keep the TypeScript migration out of scope for this phase.

## Implementation Changes

- Add a root `package.json` and `pnpm-workspace.yaml` with shared Node 22 engine policy and recursive scripts for `lint`, `test`, `pack`, and publish checks.
- Move `glc/` to `packages/gitlab-cli/` and `kaiten-cli/` to `packages/kaiten-cli/`.
- Create one private shared package, `packages/cli-core/`, for common internals used by both tools.
- Extract into `cli-core` the duplicated primitives that already exist in both tools:
  - CLI error helpers
  - arg parsing helpers like `parseCliArgs`, `csvOption`, `numberOption`
  - JSON file cache
  - field projection helpers
  - config path/default resolution helpers
  - config precedence utilities
  - hashing/redaction primitives
- Keep product-specific code inside each CLI package:
  - GitLab client, GitLab commands, `jq` integration, and tree/output rendering stay in `gitlab-cli`
  - Kaiten client, task normalization, Markdown rendering, and task-specific anonymization policy stay in `kaiten-cli`

## Public Interface Changes

- Canonical package names become:
  - `@khaale/gitlab-cli`
  - `@khaale/kaiten-cli`
- Canonical binaries remain:
  - `glc`
  - `ktc`
- Do not ship long-name binaries in phase 1.
- Preserve the current command grammars for both CLIs.
- Keep `glc config init|get|path` behavior, but reimplement it on the shared config layer.
- Add matching `ktc config init|get|path` so both tools use the same config-management model.
- Standardize config precedence as:
  1. environment variables
  2. tool config file
  3. built-in defaults
- Keep local config/cache namespaces command-based (`glc`, `ktc`) rather than package-name-based so `glc` remains backward-compatible and both tools stay easy to reason about.

## Release and Migration

- Use `workspace:*` for internal dependencies and `pnpm --filter` / `pnpm -r` for package-specific and recursive workflows.
- Ensure each published CLI package defines its own `bin`, `files`, and `prepublishOnly`/pack-check flow so releases stay independent.
- Treat the new scoped names as canonical in docs and examples immediately.
- If the old unscoped `kaiten-cli` package is already published, ship one final deprecation release that points users to `@khaale/kaiten-cli`; otherwise skip compatibility publishing.
- Shape the workspace so later moves of `mem`, `ws`, and others are straightforward package relocations, not another repo redesign.

## Test Plan

- Re-run all existing `glc` and `kaiten-cli` tests after the move without changing their behavioral expectations.
- Add `cli-core` unit tests for parsing, cache behavior, config precedence/path resolution, and hash/redaction stability.
- Add new `ktc` tests for config file support and env-overrides-config behavior.
- Add workspace smoke checks for:
  - recursive lint/test
  - per-package filtered runs
  - `npm pack`/dry-run contents for both published packages
  - binary resolution as `glc` and `ktc`

## Assumptions

- No TypeScript migration in this phase.
- `pnpm` is the workspace/package manager from the first merge.
- The exact first-phase scope is only `glc` and `ktc`.
- `@khaale` is the publish scope for the new package names.
