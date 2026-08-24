## 1. Package foundation

- [x] 1.1 Scaffold `packages/postgres-cli` with the `pgc` binary, repository-standard lint/test/build/pack scripts, and workspace metadata; verify the package is discovered by `pnpm -r` and `node --check` passes.
- [x] 1.2 Add the PostgreSQL driver and required CLI/core workspace dependencies, update the lockfile, and verify `pnpm install --frozen-lockfile` plus the package pack check succeed.
- [x] 1.3 Establish the package's JSON success/error envelope and command dispatch for sessions, schema, query, compare, and doctor operations; verify unknown commands and validation failures return stable non-zero JSON errors.
- [x] 1.4 Add `pgc` to the existing `dev-install` local command wrappers; verify `pnpm dev:install`, `command -v pgc`, and `pgc --json doctor` succeed.

## 2. Named sessions and secret handling

- [x] 2.1 Implement platform-agnostic PostgreSQL configuration resolution and validation for named sessions, defaults, secret references, and bounded execution settings; verify precedence, invalid configuration, and missing-session tests.
- [x] 2.2 Implement secret-safe session listing, configuration inspection, diagnostics, and error sanitization; verify passwords, credential-bearing URLs, and raw driver errors never appear in captured stdout/stderr or JSON payloads.
- [x] 2.3 Implement connection creation and cleanup for a selected named session, including safe metadata and server/version diagnosis; verify mocked connection success/failure and cleanup behavior without requiring a live database.
- [x] 2.4 Centralize database error sanitization so configured secrets, credential-bearing URLs, and password assignments are consistently redacted; verify the active PostgreSQL execution path uses the shared sanitizer.

## 3. Read-only query execution

- [x] 3.1 Implement the single-statement/read-only query guard for mutating SQL, session/transaction control, and multi-statement input; verify representative DML, DDL, function/control, and allowed read-query cases are classified correctly.
- [x] 3.2 Implement bounded PostgreSQL transaction execution with read-only mode, local statement timeout, row/byte limits, rollback, and connection cleanup; verify a write-capable role still cannot mutate through the tool and limit/timeout states are explicit.
- [x] 3.3 Implement parameter binding, PostgreSQL value normalization, field projection, compact JSON, and sanitized query errors; verify parameter-shape failures do not execute and output remains stable for supported scalar and typed values.

## 4. Progressive schema exploration

- [x] 4.1 Implement bounded catalog queries for overview, schema/object expansion, and selected column/table metadata with fully qualified identifiers and deterministic ordering; verify catalog fixtures cover tables, views, routines, keys, indexes, and constraints.
- [x] 4.2 Add continuation, narrowing, and inaccessible-metadata handling without silently truncating results; verify oversized fixtures return explicit continuation markers and permission failures remain distinguishable from empty results.
- [x] 4.3 Add bounded catalog search by object name with schema/type filters and detail-navigation references; verify table, view, routine, and column matches, empty results, pagination, and inaccessible catalog cases.
- [x] 4.4 Add incoming/outgoing foreign-key relationship discovery with ordered column pairs and composite-key support; verify both directions, no-relation results, and fully qualified endpoints.
- [x] 4.5 Include PostgreSQL comments for tables and columns in table detail, and match comments in bounded schema search; verify comments are returned when present and null/empty comments do not create false matches.
- [x] 4.6 Make schema overview/search truncation explicit with a sentinel row and continuation marker, and distinguish available, inaccessible, and not-found table metadata; verify low-limit and missing-table requests remain machine-readable.

## 5. Cross-environment data comparison

- [x] 5.1 Implement comparison input validation for two distinct named sessions, independent left/right read-only queries, caller-provided key/primary-key columns, and same-named result columns; verify same-session, missing-key, and incompatible-shape requests return structured errors.
- [x] 5.2 Implement bounded left/right result collection and deterministic diff classification for equal, changed, left-only, and right-only rows; verify changed fields, normalized values, stable ordering, and per-source completeness status.
- [x] 5.3 Ensure comparison never reports complete equality for truncated, timed-out, unavailable, or otherwise incomplete inputs; verify partial-result fixtures produce an incomplete result with per-source reasons.

## 6. Agent-facing documentation and release readiness

- [x] 6.1 Add `skills/postgres-cli/SKILL.md` following the existing companion-skill format; document `pgc --json doctor`, named sessions, secret handling, schema overview/search/detail/relationships, bounded read-only queries, two-query comparison with key columns, and output formats; verify examples contain no real credentials and match the CLI help.
- [x] 6.2 Document named session configuration, secret handling, read-only guarantees, progressive schema workflow, query limits, and comparison examples in the package README; verify examples contain no real credentials and match the CLI help.
- [x] 6.3 Add a changeset describing the new public PostgreSQL CLI package and verify the release metadata includes the package without versioning private core packages.
- [x] 6.4 Add integration/packaging coverage for the new workspace package and run `pnpm check`; verify lint, all unit tests, and self-contained dry-run packaging pass across the monorepo.
- [x] 6.5 Document table/column comments and comment-aware schema search in the package README and companion skill; verify examples remain secret-free and match the CLI behavior.
