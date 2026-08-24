## Purpose

This capability gives the repository's CLI tools a predictable command interface with discoverable help, early argument validation, and errors suitable for both shell users and agents.

## ADDED Requirements

### Requirement: CLI tools SHALL expose discoverable command help

An adopting CLI tool SHALL expose top-level help through `--help` and through an invocation without a command. Nested resources and commands SHALL expose their own usage and option descriptions through the same help mechanism. Help requests MUST complete without loading a session or connecting to an external service.

#### Scenario: pgc top-level help

- **WHEN** the user runs `pgc --help` or `pgc` without a command
- **THEN** `pgc` prints its command overview and exits successfully without reading database credentials or opening a database connection

#### Scenario: pgc command help

- **WHEN** the user runs `pgc query --help` or `pgc schema search --help`
- **THEN** `pgc` prints usage and the options supported by that command and exits successfully without executing a query

### Requirement: CLI tools SHALL validate command arguments before execution

An adopting CLI tool SHALL reject unknown commands, unknown options, missing required options, and values that do not match the option type before invoking the command handler. Validation failures SHALL use exit code `2`; when JSON output is requested, they SHALL be represented by the standard structured error envelope.

#### Scenario: missing required option

- **WHEN** the user runs a command that requires a session without providing its session option
- **THEN** the CLI returns a structured validation error with exit code `2` and does not load a session or connect to PostgreSQL

#### Scenario: unknown option

- **WHEN** the user supplies an option that is not supported by the selected command
- **THEN** the CLI returns a structured validation error with exit code `2` before the command handler runs

#### Scenario: invalid typed value

- **WHEN** the user supplies a value that cannot be parsed as the selected option's type
- **THEN** the CLI returns a structured validation error with exit code `2` before the command handler runs

### Requirement: Migrated command interfaces SHALL preserve supported pgc invocations

The `pgc` command interface SHALL continue to support its existing resources and verbs, output mode flags, named-session options, query input options, schema exploration options, relationship options, and comparison options. In particular, query execution SHALL continue to accept exactly one of `--sql` and `--sql-file`, and SHALL retain the per-query `--row-limit` override.

#### Scenario: query input options remain available

- **WHEN** the user runs a valid `pgc query` command with either `--sql` or `--sql-file` and an optional `--row-limit`
- **THEN** `pgc` executes the same query-input behavior and applies the same safety limits as before the command-interface migration

#### Scenario: schema and comparison commands remain available

- **WHEN** the user runs a valid schema exploration, relationship, or two-session comparison command
- **THEN** `pgc` dispatches it to the corresponding existing functionality with the requested output format
