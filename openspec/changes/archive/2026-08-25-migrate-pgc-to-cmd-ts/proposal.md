## Why

`pgc` currently parses arguments with the low-level shared tokenizer and keeps its help text and command validation in a hand-written dispatcher. This differs from the `cmd-ts` command-spec pattern already used by `glc` and `ktc`, making help, option validation, and future command additions harder to keep consistent across the tools.

## What Changes

- Migrate `pgc` command parsing and dispatch to the repository's established `cmd-ts` command-spec pattern.
- Provide generated top-level and command-level help, including usage and option descriptions.
- Validate command arguments and options through the command specification, with the existing structured CLI error/output contract preserved.
- Preserve the current `pgc` commands, aliases, output formats, named-session behavior, and query options, including `--row-limit` and `--sql-file`.
- Add regression coverage for help, valid command invocations, invalid arguments, and the self-contained executable bundle.

## Capabilities

### New Capabilities

- `shared/cli-command-interface`: Standard command parsing, generated help, and structured validation behavior shared by the repository's CLI tools.

### Modified Capabilities

None.

## Impact

- `packages/postgres-cli/src/cli.js` and a new or updated command-spec module will own the `pgc` command tree and handlers.
- `@khaale/postgres-cli` will add or align its `cmd-ts` dependency and may have small help/error text changes as a result of generated output.
- Tests, README examples, and `skills/postgres-cli/SKILL.md` will be updated where the generated help or invocation contract is user-visible.
- The existing self-contained bundling path must continue to produce runnable `pgc`, `glc`, and `ktc` executables.
