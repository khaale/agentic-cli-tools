## 1. Query input resolution

- [x] 1.1 Add positive-integer validation for `query --row-limit`, preserve the session value when omitted, and verify invalid values fail before a database client is created
- [x] 1.2 Add mutually exclusive `--sql`/`--sql-file` resolution with required-source validation, UTF-8 file reading, leading-BOM handling, and focused tests for inline, UTF-8, missing, unreadable, both-sources, and no-source cases

## 2. Bounded query execution

- [x] 2.1 Pass the resolved SQL and effective row limit through the existing read-only execution path, and verify the command-line limit overrides only `rowLimit`
- [x] 2.2 Verify byte-limit truncation and statement-timeout configuration remain active with a larger command-line row limit, including the existing structured result/error behavior

## 3. User experience and release metadata

- [x] 3.1 Update `pgc --help` and the PostgreSQL CLI README with `--row-limit`, `--sql-file`, Windows/UTF-8 usage, and the safety-limit behavior
- [x] 3.2 Update `skills/postgres-cli/SKILL.md` with the new query flags, a file-based SQL example, and guidance on retained byte/timeout safeguards
- [x] 3.3 Add a changeset for the user-facing `@khaale/postgres-cli` query input improvements and verify the package metadata remains publishable

## 4. Verification

- [x] 4.1 Run the PostgreSQL CLI tests and full `pnpm check`, confirming lint, tests, package smoke checks, and dry-run packaging all pass
