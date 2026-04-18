---
name: ktc
description: Companion skill for the `ktc` Kaiten CLI. Verify the installed command, run `ktc --json doctor` first, then use read-only task commands or `api request` when a high-level verb is missing.
---

# `ktc` Companion Skill

Use `ktc` for read-only Kaiten exploration from an agent runtime. Execute it through the available shell or terminal tool instead of assuming a dedicated `ktc` API integration exists.

## First-run order

1. Verify the command exists:

```bash
command -v ktc
```

2. Run the preflight check before reading tasks:

```bash
ktc --json doctor
```

3. If setup is missing, configure auth through environment variables or `ktc config init`.

## Auth and config

`ktc` reads configuration in this order:

1. Environment variables: `KAITEN_URL`, `KAITEN_API_TOKEN`, `KAITEN_API_BASE`, `KAITEN_BROKEN_API`, `KAITEN_CACHE_DIR`
2. Global config file from `ktc config init`

Use `ktc config path` to locate the file and `ktc config get` to inspect redacted resolved metadata.

## Safe read path

Prefer the high-level read commands first:

- `ktc tasks mine`
- `ktc tasks find`
- `ktc tasks get --id <task-id>`

Use `--space`, `--board`, `--assignee`, `--state`, and `--limit` to keep results bounded. Prefer `--json` when another machine step will consume the output.

## Raw escape hatch

If you need a read-only Kaiten endpoint that does not yet have a dedicated command, use:

```bash
ktc --json api request --path /api/latest/... [--query key=value] [--method GET|HEAD]
```

Only `GET` and `HEAD` are supported. Do not improvise writes without explicit user approval.

## Guardrails

- Start with `ktc --json doctor` in a fresh thread or environment.
- Prefer `tasks mine|find|get` over `api request`.
- Default output is Markdown; add `--json` for machine-readable output.
- Use `--refresh` only when cache staleness is more likely than repeated reads.
- This CLI is read-only in the current version.

## Copy-paste examples

```bash
ktc --json doctor
ktc tasks find --assignee me --state open --json
ktc --json api request --path /api/latest/spaces --query query=platform
```
