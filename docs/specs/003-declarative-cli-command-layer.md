# Declarative CLI Command Layer for `glc`

## Summary

- Refactor `glc` so resource and verb declarations live at the CLI edge instead of being spread across command handlers.
- Keep the existing `glc <resource> <verb>` grammar intact in the first migration.
- Parse, validate, coerce, and normalize command input before calling lower-level GitLab command code.
- Keep the first implementation scoped to `/Users/aleksander_khanteev/Documents/projects/khaale/agentic-harness/packages/gitlab-cli`.

## Goals And Boundaries

- Lower-level modules such as `mrs`, `pipelines`, and `repos` should work with plain JS input objects and runtime dependencies, not raw argv state.
- The top-level CLI layer owns:
  - command matching
  - required flag enforcement
  - option coercion such as numbers and CSV lists
  - command-specific validation
  - help and argument error behavior
- The first pass does not redesign the command grammar or introduce breaking output changes.
- `kaiten-cli` stays on the current parser for now, but the shared command-definition layer should be reusable there later.

## Current Pain Point

- Low-level token parsing is already centralized in `@khaale/cli-core`.
- Semantic validation still lives inside resource handlers:
  - `mrs get|changes|snapshot` enforce `--project` and `--mr` inside `packages/gitlab-cli/src/commands/mrs.js`
  - `pipelines list|get` enforce selectors inside `packages/gitlab-cli/src/commands/pipelines.js`
  - `repos tree|refs|file` enforce project and path requirements inside `packages/gitlab-cli/src/commands/repos.js`
- This makes command modules partly responsible for CLI concerns instead of only domain behavior.

## Command Definition Layer

- Build the GitLab CLI command tree directly with `cmd-ts`.
- Declare commands by resource and verb at the top level, with:
  - required and optional selectors
  - coercion rules
  - defaults
  - verb-specific input shaping
  - bound executor function
- Use `cmd-ts` native help output instead of maintaining a handwritten `writeHelp()` block.
- Top-level config shorthand such as `glc init` may be preserved through a tiny argv normalization pass before handing control to `cmd-ts`.

## Runtime And Module Boundaries

- `packages/gitlab-cli/src/cli.js` becomes `cmd-ts` execution plus output shaping only.
- Client setup, config loading, field projection, `jq`, and final output formatting stay in the CLI entrypoint.
- Resource modules should expose verb executors directly, for example:
  - `listMergeRequests(client, input)`
  - `getMergeRequest(client, input)`
  - `snapshotMergeRequest(client, input)`
- Do not keep compatibility wrappers such as `handle<Resource>(client, verb, options)` once direct subcommand dispatch is in place.

## Public Interface Changes

- Preserve the current `glc` grammar in phase 1.
- Preserve current flag names and top-level config behavior.
- Small cleanup is allowed only for clearer help and argument error output.
- Existing output modes and exit-code semantics should remain stable.

## Migration Plan

- Add the `cmd-ts` dependency to `packages/gitlab-cli`.
- Build the GitLab command declaration tree in `packages/gitlab-cli`.
- Migrate `gitlab-cli` first, including representative commands:
  - `config init|get|path`
  - `mrs list|get|changes|snapshot`
  - `pipelines list|get`
- Leave `kaiten-cli` on the existing parser until it is migrated independently.

## Test Plan

- Keep existing CLI behavior tests for help, config, and output modes.
- Add regression coverage for parsed command dispatch on:
  - `mrs list`
  - `mrs get --with`
  - `mrs snapshot --output-dir`
  - `pipelines get`
  - top-level `config` shorthand
- Add validation tests proving missing required selectors fail before executor invocation.
- Add unit tests showing migrated resource executors work with mocked clients and plain input objects.

## Assumptions

- The implementation uses `cmd-ts` directly in `gitlab-cli`.
- A broader TypeScript migration is not required for this refactor.
