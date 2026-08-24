---
name: pgc
description: Companion skill for the `pgc` PostgreSQL CLI. Run `pgc doctor --json` first, use named sessions without handling credentials, explore large schemas progressively, execute bounded read-only queries, and compare two query results by key columns.
---

# `pgc` Companion Skill

Use `pgc` for read-only PostgreSQL exploration from an agent runtime. Execute it through the available shell or terminal tool; do not read the PostgreSQL config file or handle its passwords directly.

## First-run order

1. Verify the command exists:

```bash
command -v pgc
```

2. Run the preflight check before real reads:

```bash
pgc doctor --json
```

3. Select a configured session by name, such as `qa` or `uat`. Never pass a password or credential-bearing connection string as an argument.

## Session and output rules

- Use `pgc sessions list --json` or `pgc config get --json` to inspect safe session metadata.
- JSON is the canonical format for agent processing.
- Use `--md` only when a human-readable summary is needed.
- Use `--csv` only for flat tabular query results; use JSON for schema and comparison results.
- Treat `truncated: true`, timeout, unavailable, or compatibility errors as incomplete data.
- Do not copy secrets into prompts, shell history, logs, or task comments.

## Progressive schema exploration

Start narrow and expand only the needed object:

```bash
pgc schema overview --session qa --json
pgc schema search --session qa --query order --type table --json
pgc schema table --session qa --schema public --table orders --json
pgc schema relations --session qa --schema public --table orders --direction both --json
```

Search supports table, view, routine, and column names and PostgreSQL comments with optional `--schema` and `--type` filters. Table detail returns table and column comments when available. Relationship results distinguish `incoming` and `outgoing` foreign keys and preserve composite-key column order.

Treat a non-null `continuation` in schema overview/search as an incomplete list and narrow the request or increase `--limit`. Check `table.availability` before interpreting empty table metadata: it can be `available`, `inaccessible`, or `not_found`.

## Safe query path

Use parameterized, bounded read queries:

```bash
pgc query \
  --session qa \
  --sql 'SELECT id, status FROM public.orders WHERE id = $1' \
  --params '[42]' \
  --json
```

For a larger intentional read, override only the row limit for this invocation:

```bash
pgc query \
  --session qa \
  --row-limit 5000 \
  --sql 'SELECT id, status FROM public.orders' \
  --json
```

Keep the byte and statement-timeout limits as safety bounds; `--row-limit` does not disable them. For complex SQL, especially on Windows/PowerShell, read a UTF-8 file instead of passing the script through shell quoting:

```powershell
pgc query --session qa --sql-file .\queries\orders.sql --row-limit 5000 --json
```

Use exactly one of `--sql` and `--sql-file`. Files with a leading UTF-8 BOM are supported.

The CLI rejects writes, DDL, session/transaction control, and multi-statement SQL. Every query runs in a read-only transaction with timeout, row, and byte limits. If more detail is needed, narrow the query explicitly rather than trying to bypass the limits.

## Compare two query results

Provide distinct sessions, independent read-only queries, and same-named key columns:

```bash
pgc compare \
  --left-session qa \
  --right-session uat \
  --left-query 'SELECT id, status FROM public.orders' \
  --right-query 'SELECT order_id AS id, status FROM public.orders' \
  --key id \
  --json
```

The comparison reports equal, changed, left-only, and right-only rows. If either query is truncated, times out, fails, or has incompatible columns, the result is incomplete and must not be described as equality.
