## 1. Command specification

- [x] 1.1 Inventory the current `pgc` resources, verbs, aliases, and options and encode the complete command tree in a `cmd-ts` command-spec module; verify every documented invocation has a corresponding parser definition
- [x] 1.2 Add `cmd-ts` as a runtime dependency of `@khaale/postgres-cli` and verify the workspace lockfile resolves the same version family used by `glc` and `ktc`
- [x] 1.3 Connect parsed command arguments to the existing `pgc` domain handlers without changing session resolution, query safety options, schema exploration, comparison, or output data; verify existing PostgreSQL CLI tests remain green

## 2. CLI boundary and help

- [x] 2.1 Replace the custom argument-parser/static-help entry path with safe command-spec execution and preserve JSON/text error routing, exit codes, and output-format selection; verify `pgc --help` and `pgc` do not invoke configuration or database dependencies
- [x] 2.2 Add generated top-level and nested help coverage for `doctor`, `sessions`, `schema`, `query`, and `compare`; verify help includes required options such as `--sql-file` and `--row-limit`
- [x] 2.3 Add parser validation coverage for unknown commands/options, missing required options, and invalid typed values; verify failures use exit code `2`, structured JSON when requested, and do not execute handlers

## 3. Compatibility and packaging

- [x] 3.1 Add command-spec compatibility tests for all existing `pgc` command families and both SQL input forms, including query row-limit overrides; verify the tests preserve the archived query-input requirements
- [x] 3.2 Update `packages/postgres-cli/README.md` and `skills/postgres-cli/SKILL.md` only where generated help or invocation examples change; verify examples match `pgc --help`
- [x] 3.3 Add a patch changeset for the user-visible CLI interface migration and verify it names `@khaale/postgres-cli`
- [x] 3.4 Run the self-contained `pgc` bundle smoke test and the full repository check; verify the package build remains runnable and `pnpm check` passes
