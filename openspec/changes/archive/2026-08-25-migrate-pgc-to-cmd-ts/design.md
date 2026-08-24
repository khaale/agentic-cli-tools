## Context

`glc` and `ktc` already define their command trees with `cmd-ts`, use `runSafely` for parser failures, and adapt those failures to the repository's JSON/text error contract. `pgc` instead combines `createCliArgParser`, a static help string, and a hand-written dispatcher. The migration must preserve the behavior described in the new shared CLI command-interface specification and the existing PostgreSQL query-input specification.

## Goals / Non-Goals

**Goals:**

- Make `pgc` follow the same command-spec and parser-error flow as `glc` and `ktc`.
- Keep command handlers focused on PostgreSQL behavior rather than token parsing.
- Generate help from the command definitions and test parser behavior independently from database execution.
- Preserve JSON-by-default output, `--md`/`--csv`, named sessions, query safety limits, and all existing command paths.

**Non-Goals:**

- Do not redesign PostgreSQL operations, configuration, output rendering, or query safety.
- Do not change `cli-core` into a generic command-definition wrapper in this change.
- Do not migrate `glc` or `ktc`; they are the reference implementations for the pattern.

## Decisions

### Use the established direct `cmd-ts` pattern

Add `cmd-ts` as a runtime dependency of `@khaale/postgres-cli` and create a `pgc` command-spec module modeled on the existing `glc` and `ktc` modules. This keeps the command tree explicit and makes the implementation consistent with working repository examples.

An internal wrapper in `cli-core` is not introduced: the current tools do not share such a wrapper, and adding one would expand this refactor without solving a concrete `pgc` requirement. Shared config, errors, and output helpers remain in `cli-core` where they already belong.

### Keep handlers and normalize at the CLI boundary

Existing domain functions remain responsible for config resolution, PostgreSQL access, schema operations, comparisons, and output data. The command-spec handlers translate parsed arguments into the same option objects those functions already receive. The CLI entry point unwraps command results, handles `runSafely` parser failures, and preserves the existing structured JSON error envelope and text-stream routing.

### Represent option types in the command specification

Options such as positive row limits, numeric safety settings, CSV lists, and JSON query parameters will be parsed or validated at the command boundary where practical. Domain-level validation remains for rules that depend on the command semantics, such as exactly one SQL source. This separates generic argument errors from query-specific errors without changing their observable safety behavior.

### Treat generated help as the source of truth

The static help block will be removed after the command tree covers every currently supported resource, verb, alias, and option. Tests will assert key help content and that help does not initialize configuration or database access; README and skill examples will be updated only where generated usage differs materially.

## Risks / Trade-offs

- [Risk] `cmd-ts` help or parser wording differs from the current static text. → Mitigate by testing stable command/option presence and preserving exit codes and structured error fields rather than asserting incidental prose.
- [Risk] A command or flag is omitted during the hand-written command-tree migration. → Mitigate with a command inventory from the current dispatcher, focused parse tests for every resource, and the full monorepo check.
- [Risk] The runtime bundle resolves the new dependency differently from the workspace tests. → Mitigate by running the existing self-contained bundle smoke test for `pgc` and the repository-wide packaging checks.
- [Risk] Parser-level validation changes when configuration or database work starts. → Mitigate by testing invalid invocations with injected dependencies and asserting those dependencies are not called.

## Migration Plan

1. Add the command specification and map all current `pgc` commands and options to it.
2. Replace the custom parser/dispatch entry path while retaining the existing domain handlers.
3. Add parser, help, compatibility, and bundle smoke tests; update user-facing documentation and the package changeset.
4. Run strict OpenSpec validation and `pnpm check`.

Rollback is a source revert of the migration commit; no persisted configuration or database schema changes are involved.
