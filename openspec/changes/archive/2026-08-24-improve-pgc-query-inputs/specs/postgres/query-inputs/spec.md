## Purpose

Provide reliable, bounded ways to supply larger or complex read-only SQL queries to `pgc` across shells and operating systems.

## ADDED Requirements

### Requirement: Override the query row limit from the command line

The `query` command SHALL accept a positive integer `--row-limit` option that overrides the selected session's configured `rowLimit` for that invocation only. When the option is absent, the configured session limit SHALL remain effective.

#### Scenario: Command-line row limit overrides the session

- **WHEN** the user runs `pgc query` with `--row-limit 5000` and the selected session has `rowLimit` set to 1000
- **THEN** the query execution and result normalization use 5000 as the row limit for that invocation

#### Scenario: Configured row limit remains the default

- **WHEN** the user runs `pgc query` without `--row-limit`
- **THEN** the selected session's configured `rowLimit` is used

#### Scenario: Invalid row-limit values fail before execution

- **WHEN** `--row-limit` is missing a value or is not a positive integer
- **THEN** `pgc` returns a structured CLI error and does not connect to PostgreSQL

### Requirement: Preserve independent query safety limits

The `query` command SHALL continue applying the selected session's `byteLimit` and `statementTimeoutMs` regardless of whether `--row-limit` is supplied. A row-limit override SHALL NOT provide an option to disable or bypass either safety limit.

#### Scenario: Large row override remains byte-bounded

- **WHEN** a query is run with a row limit larger than the session's `byteLimit` can represent
- **THEN** the result is truncated at the byte limit and reports `truncated: true`

#### Scenario: Large row override remains time-bounded

- **WHEN** a query is run with any row-limit override
- **THEN** the session's configured statement timeout is still applied to the PostgreSQL transaction

### Requirement: Read SQL from a UTF-8 file

The `query` command SHALL accept `--sql-file PATH` as an alternative to `--sql`, read the referenced file as UTF-8, and execute the resulting SQL through the same read-only validation and safety limits as inline SQL. A leading UTF-8 BOM SHALL be ignored.

#### Scenario: Execute SQL from a file

- **WHEN** the user runs `pgc query --sql-file query.sql`
- **THEN** `pgc` reads the file as UTF-8 and executes its SQL using the selected session

#### Scenario: Preserve non-ASCII SQL content

- **WHEN** a UTF-8 SQL file contains non-ASCII identifiers, comments, or string literals
- **THEN** the SQL reaches validation and execution without shell-dependent re-encoding

#### Scenario: Missing or unreadable SQL file

- **WHEN** the path does not exist or cannot be read
- **THEN** `pgc` returns a structured CLI error identifying that the SQL file could not be read and does not execute a query

### Requirement: Require one SQL input source

The `query` command SHALL require exactly one of `--sql` and `--sql-file`. Supplying both or neither SHALL be rejected before PostgreSQL execution.

#### Scenario: Inline and file SQL are both supplied

- **WHEN** the user supplies both `--sql` and `--sql-file`
- **THEN** `pgc` returns a structured CLI error explaining that the SQL sources are mutually exclusive

#### Scenario: Neither SQL source is supplied

- **WHEN** the user runs `pgc query` without `--sql` or `--sql-file`
- **THEN** `pgc` returns a structured CLI error requiring one SQL source

