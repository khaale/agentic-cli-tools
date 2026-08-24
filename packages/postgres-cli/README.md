# `pgc`

Read-only PostgreSQL explorer for agents.

`pgc` works with named sessions such as `qa` and `uat`. The agent selects a session name; passwords are resolved inside the process and are never printed by the CLI.

## Configuration

The platform-specific config path is shown by:

```bash
pgc --json config path
```

Initialize an empty config with:

```bash
pgc --json config init
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
pgc --json doctor
```

Explore a large schema progressively:

```bash
pgc --json schema overview --session qa
pgc --json schema search --session qa --query user --type table
pgc --json schema table --session qa --schema public --table users
pgc --json schema relations --session qa --schema public --table users --direction both
```

`schema table` includes PostgreSQL comments for the table and its columns when they are defined. `schema search` matches both object names and comments, which makes documented business terms useful for finding tables and columns.

Schema list responses include `continuation` when the requested limit is reached. Table details expose `table.availability` as `available`, `inaccessible`, or `not_found`.

Run a bounded read-only query:

```bash
pgc --json query --session qa --sql 'SELECT id, email FROM public.users WHERE id = $1' --params '[42]'
```

Compare two independently supplied queries by same-named key columns. Use SQL aliases when the source column names differ:

```bash
pgc --json compare \
  --left-session qa \
  --right-session uat \
  --left-query 'SELECT id, status FROM public.users' \
  --right-query 'SELECT user_id AS id, status FROM public.accounts' \
  --key id
```

## Safety and output

- Every query runs in a PostgreSQL read-only transaction.
- Mutating, session-control, transaction-control, and multi-statement SQL is rejected before execution.
- Queries are bounded by statement timeout, row limit, and result byte limit.
- JSON is the canonical agent format. `--md` renders a human-readable view; `--csv` is for tabular query results only.
- Truncated, timed-out, unavailable, or incompatible comparison inputs are marked incomplete and are never reported as complete equality.
