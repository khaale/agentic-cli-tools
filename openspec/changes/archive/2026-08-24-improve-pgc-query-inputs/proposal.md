## Why

`pgc query` currently applies the configured row limit, which makes the default 1,000-row cap inconvenient for intentional larger reads even when the byte and statement-timeout safeguards are sufficient. Passing a complex SQL script through PowerShell command-line quoting is also error-prone on Windows, so users need a file-based SQL input path.

## What Changes

- Add a `query` command-line row-limit override that takes precedence over the selected session's configured `rowLimit`.
- Keep the selected session's `byteLimit` and `statementTimeoutMs` active for every query, including queries using the override.
- Add `query --sql-file PATH` as an alternative to inline `--sql`; read the file as UTF-8 and tolerate a leading UTF-8 BOM.
- Require exactly one SQL source (`--sql` or `--sql-file`) and return the existing structured error shape for invalid combinations or unreadable files.
- Preserve the existing read-only validation, truncation reporting, and secret-redaction behavior.

## Capabilities

### New Capabilities

- `postgres/query-inputs`: Define command-line row-limit overrides and UTF-8 SQL-file input for PostgreSQL queries.

### Modified Capabilities

<!-- No existing main capability spec currently owns the PostgreSQL query contract. -->

## Impact

- `packages/postgres-cli/src/cli.js` and query execution helpers for input resolution and limit precedence.
- PostgreSQL CLI README/help text and focused tests for CLI parsing, file encoding, and safety-limit preservation.
- No database schema, connection, or dependency changes.
