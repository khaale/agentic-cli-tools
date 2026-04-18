# Agent CLI Runtime Contract for `glc` and `ktc`

## Summary

- Add a shared agent-facing runtime contract to both CLIs:
  - `doctor` command with stable `--json` output
  - machine-readable JSON error envelope when `--json` is requested
  - read-only raw escape hatch via `api request`
- Keep the implementation scoped to the existing workspace under `packages/gitlab-cli`, `packages/kaiten-cli`, and `packages/cli-core`.
- Do not expand product discovery or resolve surfaces in this change.

## Goals

- Give agents a safe first command that validates auth, config, and basic reachability.
- Ensure `--json` can be trusted for both success and failure paths.
- Provide an honest read-only fallback for unsupported read endpoints without inventing new high-level verbs.
- Reuse the boring runtime pieces across both CLIs where that reduces duplication.

## Non-Goals

- No new domain-level discovery commands for spaces, boards, groups, or projects.
- No write-oriented raw API mode.
- No interactive auth or login flow.
- No new product-specific resource families beyond `doctor` and `api request`.

## Shared Runtime Rules

- `cli-core` should own the generic helpers for:
  - JSON error envelope rendering
  - doctor snapshot normalization for auth/config state
  - redaction rules for secrets in doctor output
- `cli-core` should not own product-specific API endpoints or request shapes.

## `doctor` Contract

- Both CLIs gain a top-level `doctor` command.
- `doctor --json` returns a stable object with:
  - `tool`
  - `ok`
  - `config_path`
  - `auth`
  - `cache`
  - `checks`
  - `missing`
- `auth` must report whether a token exists and its source category when known.
- `checks` must include at least one simple read-only reachability check against the configured service.
- `doctor` must never print raw tokens.

## JSON Error Contract

- When `--json` is requested, parse and runtime failures should be emitted as JSON instead of plain text.
- Error payloads should include:
  - `ok: false`
  - `error.code`
  - `error.message`
  - optional `error.details`
- Error output must not contain credentials.

## Raw Escape Hatch

- Add `api request` to both CLIs.
- It is read-only in this phase:
  - allow `GET`
  - allow `HEAD`
  - reject other methods with a CLI error
- It should accept an explicit API path and optional query parameters.
- Output should support normal formatting flags, with `--json` returning parsed JSON when possible and raw text otherwise.

## Documentation and Skills

- README files should describe:
  - how to verify install with `command -v`
  - `doctor --json` as the first safe command
  - the raw read-only `api request` escape hatch
- Companion skills should present commands in this order:
  - verify command exists
  - run `doctor --json`
  - use the safest discovery/read path
  - use `api request` only when the high-level surface is insufficient

## Test Plan

- Add red/green tests for:
  - `doctor --json` success shape
  - JSON error envelope under `--json`
  - `api request` rejecting non-read methods
  - `api request` returning read-only payloads
- Re-run full workspace tests after implementation.
