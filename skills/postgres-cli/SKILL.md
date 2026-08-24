---
name: pgc
description: Companion skill for the `pgc` PostgreSQL CLI. Run `pgc --json doctor` first, use named sessions without handling credentials, explore large schemas progressively, execute bounded read-only queries, and compare two query results by key columns.
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
pgc --json doctor
```

3. Select a configured session by name, such as `qa` or `uat`. Never pass a password or credential-bearing connection string as an argument.

## Session and output rules

- Use `pgc --json sessions list` or `pgc --json config get` to inspect safe session metadata.
- JSON is the canonical format for agent processing.
- Use `--md` only when a human-readable summary is needed.
- Use `--csv` only for flat tabular query results; use JSON for schema and comparison results.
- Treat `truncated: true`, timeout, unavailable, or compatibility errors as incomplete data.
- Do not copy secrets into prompts, shell history, logs, or task comments.

## Progressive schema exploration

Start narrow and expand only the needed object:

```bash
pgc --json schema overview --session qa
pgc --json schema search --session qa --query order --type table
pgc --json schema table --session qa --schema public --table orders
pgc --json schema relations --session qa --schema public --table orders --direction both
```

Search supports table, view, routine, and column names and PostgreSQL comments with optional `--schema` and `--type` filters. Table detail returns table and column comments when available. Relationship results distinguish `incoming` and `outgoing` foreign keys and preserve composite-key column order.

Treat a non-null `continuation` in schema overview/search as an incomplete list and narrow the request or increase `--limit`. Check `table.availability` before interpreting empty table metadata: it can be `available`, `inaccessible`, or `not_found`.

## Safe query path

Use parameterized, bounded read queries:

```bash
pgc --json query \
  --session qa \
  --sql 'SELECT id, status FROM public.orders WHERE id = $1' \
  --params '[42]'
```

The CLI rejects writes, DDL, session/transaction control, and multi-statement SQL. Every query runs in a read-only transaction with timeout, row, and byte limits. If more detail is needed, narrow the query explicitly rather than trying to bypass the limits.

## Compare two query results

Provide distinct sessions, independent read-only queries, and same-named key columns:

```bash
pgc --json compare \
  --left-session qa \
  --right-session uat \
  --left-query 'SELECT id, status FROM public.orders' \
  --right-query 'SELECT order_id AS id, status FROM public.orders' \
  --key id
```

The comparison reports equal, changed, left-only, and right-only rows. If either query is truncated, times out, fails, or has incompatible columns, the result is incomplete and must not be described as equality.
