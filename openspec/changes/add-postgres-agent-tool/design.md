## Context

The repository contains two read-oriented agent CLIs with shared configuration, output, and diagnostic conventions. The new tool must work with PostgreSQL servers rather than an HTTP API, must support multiple environments, and must treat credentials and potentially very large result sets as sensitive. See `proposal.md` and the four capability specs for the motivation and observable contract.

## Goals / Non-Goals

**Goals:**

- Add a standalone workspace package for a PostgreSQL agent CLI, using the repository's existing command, configuration, JSON output, testing, and packaging conventions.
- Make named sessions the only agent-facing connection handle; credentials are resolved inside the process and never accepted as query arguments or emitted in output.
- Establish defense-in-depth read-only behavior for every agent operation.
- Make schema exploration and data comparison bounded, deterministic, and explicit about incomplete results.

**Non-Goals:**

- Supporting migrations, backups, restores, replication administration, or arbitrary database administration.
- Providing a general-purpose SQL console or a write-enabled escape hatch in the first version.
- Synchronizing or modifying data between environments.
- Creating database roles, changing grants, or requiring schema changes in connected databases.

## Decisions

### Use a dedicated `postgres-cli` package with a `pgc` executable

The tool will be a new package at `packages/postgres-cli`, distributed under the short executable name `pgc`. It will follow the existing CLI command conventions and reuse `createCliArgParser` plus other utilities from `@khaale/cli-core` for platform-agnostic configuration paths, common errors, field projection, and output conventions. A dedicated package keeps PostgreSQL dependencies and security-sensitive connection code out of the existing GitLab/Kaiten tools.

An MCP server or database-specific shell was considered, but the repository currently distributes self-contained CLIs and the agent can invoke stable JSON commands directly. An MCP adapter can be added later without changing the capability contracts.

### Store named sessions in a restrictive local configuration

The configuration will contain named session definitions, including host, port, database, user, and a password or secret reference, plus safe defaults such as statement timeout and result limits. The configuration path will use the shared platform-agnostic resolver, be created with restrictive permissions where supported, and never be rendered in full.

The runtime will resolve a session name to an internal connection object. Commands will accept only the session name, not a password or raw credential-bearing connection string. Configuration inspection and errors will return redacted metadata. Environment overrides may change non-secret settings and secret references, but raw secrets will not be included in diagnostic or query output.

### Enforce read-only at both the command and database transaction layers

The query execution path will accept only one bounded statement and will reject known mutating, session-changing, transaction-changing, and multi-statement inputs before opening the query. The actual operation will run inside a PostgreSQL read-only transaction with a local statement timeout and will always roll back/close the transaction after the result is collected.

The statement guard is an early, understandable failure mode; PostgreSQL's transaction-level read-only setting is the final database-side enforcement. This is preferred over relying only on the configured role's grants, because the tool must retain its safety behavior even when a session has write privileges. The tool will not expose a write command or a flag that disables these protections.

### Query catalogs in small, navigable slices

Schema commands will query PostgreSQL catalog views for one level at a time. The default response will be an overview with counts and continuation/narrowing information. Catalog list queries will fetch one sentinel row beyond the requested limit so truncation is explicit. Follow-up requests will select a fully qualified schema, table, view, or column and a bounded detail level. Results will use stable ordering and explicit limits; no command will dump the complete catalog into one response by default.

Schema exploration will also provide a catalog search operation that matches object names, including table, view, routine, and column names, with optional schema/object-type filters. Search results will return compact fully qualified references that can be passed to a detail request, rather than expanding every match inline.

Table detail will include PostgreSQL comments for the selected table and each returned column. Catalog search will match both object names and available comments and will return the comment as a compact description, so business terminology documented in the database can be used to discover technical objects without expanding the full schema.

Table detail will include an availability status of `available`, `inaccessible`, or `not_found`. This prevents an empty catalog slice caused by a missing or unauthorized table from being mistaken for a valid table with no columns or relationships.

Table detail will expose foreign-key relationships in two directions: `outgoing` relationships from the selected table to referenced tables, and `incoming` relationships from tables that reference it. Each relationship will include its constraint name, fully qualified endpoints, and ordered source/target column pairs so composite keys remain unambiguous.

Schema metadata will not be cached as a correctness requirement in the first version. A future cache can be added only with a clear invalidation policy, because QA/UAT schemas can diverge and catalog permissions can change.

### Compare bounded results of two queries in memory using explicit keys

The first comparison mode will run independently supplied `leftQuery` and `rightQuery` against two distinct named sessions. The caller supplies one or more key/primary-key columns; those columns must be present under the same names in both result sets. Non-key columns are matched by name as well, so the caller can use SQL aliases to align different source schemas. Each side is bounded by the same row, byte, and timeout limits; the tool validates compatible result shapes before building indexes and reports left-only, right-only, equal, and changed rows.

Values will be normalized into a stable JSON comparison representation while preserving type information where PostgreSQL values cannot be represented safely as plain JSON. Comparison output will include both non-secret source session names and per-source completeness status. If either side is truncated, timed out, unavailable, or incompatible, the result will be marked incomplete rather than reported as equal.

### Use one stable machine-readable output envelope

Successful commands will emit JSON by default and support compact JSON/field projection consistent with the existing tools. Errors will use the repository's `ok: false` envelope with a stable code and sanitized message/details. Human-readable output, if added, will be a rendering of the same bounded result and will not create a separate behavioral contract.

### Ship a companion agent skill with the CLI

The package will include `skills/pgc/SKILL.md` following the existing `glc`/`ktc` companion-skill pattern. It will instruct an agent to run `pgc --json doctor` first, select a named session instead of handling credentials, start schema exploration with an overview or name search, expand only required objects and relationships, keep queries read-only and bounded, and compare two independently supplied query results using same-named key columns. The skill will document JSON as the canonical format and mention Markdown/CSV only as explicit renderings where supported.

## Risks / Trade-offs

- **[Risk] A configured password remains sensitive at rest in a local file.** → Use restrictive file permissions, avoid command-line arguments and logs, support secret references, redact configuration/error output, and document that local filesystem access remains authoritative.
- **[Risk] SQL functions or unusual PostgreSQL statements can have side effects that a textual guard cannot classify perfectly.** → Reject multi-statement/session-control forms, run every operation in a read-only transaction, and treat the database transaction setting as the final safety boundary.
- **[Risk] Large tables make comparison expensive or misleading.** → Enforce shared row/byte/time limits, require explicit keys or a deterministic identity, include truncation/incompleteness markers, and never claim equality from a partial result.
- **[Risk] Catalog visibility differs between QA and UAT roles.** → Return per-object availability and structured permission errors instead of treating inaccessible metadata as an empty schema.
- **[Risk] A PostgreSQL driver increases package size and packaging complexity.** → Keep the dependency isolated to `postgres-cli`, exercise the self-contained pack check in CI, and avoid adding a shared abstraction until another package needs it.

## Migration Plan

No database migration is required. The rollout adds a new package and a local configuration file; existing GitLab/Kaiten packages and connected databases remain unchanged. Rollback is removal of the new package/configuration or reverting the release; because all first-version operations are read-only, rollback does not require data repair.
