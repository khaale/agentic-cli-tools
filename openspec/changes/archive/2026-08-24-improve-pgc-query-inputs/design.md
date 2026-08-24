## Context

`pgc` currently parses all command-line options as strings, passes inline `options.sql` directly to `executeReadQuery`, and derives the effective row limit from the named session. Query execution already applies the session byte limit and statement timeout independently of the row limit. See `proposal.md` and `specs/postgres/query-inputs/spec.md` for the requested behavior.

## Goals / Non-Goals

**Goals:**

- Resolve one SQL source for `query` before opening a database connection.
- Validate a per-invocation positive row-limit override and pass it through the existing execution options.
- Read SQL files as UTF-8 in a platform-independent way, including files with a leading UTF-8 BOM.
- Keep byte and timeout limits sourced from the selected session and unchanged by the override.
- Make all input and file failures use the existing JSON error envelope and exit-code behavior.

**Non-Goals:**

- No unbounded or unlimited export mode.
- No row-limit override for schema listing `--limit` or the `compare` command in this change.
- No support for multiple statements; the existing read-only validator continues to reject them.
- No changes to PostgreSQL roles, connection settings, or output formats.

## Decisions

- Use the explicit flag name `--row-limit` rather than overloading `--limit`, because schema commands already use `--limit` for catalog pagination and the query option controls a safety bound.
- Resolve `--sql-file` in the CLI dispatch layer and pass the resulting SQL string through the existing `executeReadQuery` path. This keeps read-only validation, timeout setup, byte limiting, and truncation semantics in one execution path.
- Read files using the repository's injectable filesystem boundary where available, with UTF-8 decoding and a leading `\uFEFF` removed. This makes Windows PowerShell-generated files work without depending on shell quoting or platform-specific newline behavior.
- Validate `--row-limit` as a positive integer before `executeReadQuery` is called. The effective execution options should override only `rowLimit`; `statementTimeoutMs` and `byteLimit` continue to fall back to the session values.
- Treat `--sql` and `--sql-file` as mutually exclusive and require one source. File errors should be normalized at the CLI boundary so JSON and human-readable modes remain consistent with existing failures.

## Risks / Trade-offs

- [Risk] A larger row limit can increase memory and output size. → Keep the configured byte limit and statement timeout mandatory safety bounds, and expose truncation in the existing result shape.
- [Risk] A SQL file may contain a BOM or Windows line endings. → Decode as UTF-8 and strip only a leading BOM; leave SQL content otherwise unchanged for PostgreSQL validation.
- [Risk] File reads could become difficult to unit-test if they use global filesystem calls. → Inject the file-read capability through the existing runtime/dependency path and cover missing, UTF-8, and BOM cases with focused tests.
