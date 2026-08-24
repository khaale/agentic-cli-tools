# `pgc`

Read-only PostgreSQL explorer for agents.

`pgc` works with named sessions such as `qa` and `uat`. The agent selects a session name; passwords are resolved inside the process and are never printed by the CLI.

## Configuration

The platform-specific config path is shown by:

```bash
pgc config path --json
```

Initialize an empty config with:

```bash
pgc config init --json
```

A config contains named sessions and bounded read defaults:

```json
{
  "sessions": {
    "qa": {
      "host": "qa.example.internal",
      "port": 5432,
      "database": "app",
      "user": "agent",
      "passwordEnv": "PGC_QA_PASSWORD",
      "ssl": true
    },
    "uat": {
      "host": "uat.example.internal",
      "database": "app",
      "user": "agent",
      "passwordEnv": "PGC_UAT_PASSWORD"
    }
  },
  "defaults": {
    "statementTimeoutMs": 30000,
    "rowLimit": 1000,
    "byteLimit": 1048576
  }
}
```

Use `password` instead of `passwordEnv` only when the local config policy permits storing a password. The config file is written with restrictive permissions where supported. `pgc` never returns either value in JSON, Markdown, CSV, errors, or diagnostics.

## Agent workflow

Start with the preflight check:

```bash
pgc doctor --json
```

Explore a large schema progressively:

```bash
pgc schema overview --session qa --json
pgc schema search --session qa --query user --type table --json
pgc schema table --session qa --schema public --table users --json
pgc schema relations --session qa --schema public --table users --direction both --json
```

`schema table` includes PostgreSQL comments for the table and its columns when they are defined. `schema search` matches both object names and comments, which makes documented business terms useful for finding tables and columns.

Schema list responses include `continuation` when the requested limit is reached. Table details expose `table.availability` as `available`, `inaccessible`, or `not_found`.

Run a bounded read-only query:

```bash
pgc query --session qa --sql 'SELECT id, email FROM public.users WHERE id = $1' --params '[42]' --json
```

Override the configured row limit for one query while keeping the session's byte and statement-timeout limits:

```bash
pgc query --session qa --row-limit 5000 --sql 'SELECT id, email FROM public.users' --json
```

Read complex SQL from a UTF-8 file. This is also convenient on Windows when PowerShell quoting would be cumbersome:

```powershell
pgc query --session qa --sql-file .\queries\users.sql --row-limit 5000 --json
```

`--sql` and `--sql-file` are mutually exclusive. The SQL file may contain a leading UTF-8 BOM; it is ignored. The row-limit override does not disable the configured byte limit or statement timeout.

Compare two independently supplied queries by same-named key columns. Use SQL aliases when the source column names differ:

```bash
pgc compare \
  --left-session qa \
  --right-session uat \
  --left-query 'SELECT id, status FROM public.users' \
  --right-query 'SELECT user_id AS id, status FROM public.accounts' \
  --key id \
  --json
```

Run `pgc --help` or `pgc <command> --help` for generated command and option help. Output flags are conventionally placed after the command; the legacy form with `--json` before the command remains accepted.

## Safety and output

- Every query runs in a PostgreSQL read-only transaction.
- Mutating, session-control, transaction-control, and multi-statement SQL is rejected before execution.
- Queries are bounded by statement timeout, row limit, and result byte limit. `--row-limit` can override the configured row limit for one query, but byte and timeout limits always remain active.
- JSON is the canonical agent format. `--md` renders a human-readable view; `--csv` is for tabular query results only.
- Truncated, timed-out, unavailable, or incompatible comparison inputs are marked incomplete and are never reported as complete equality.
