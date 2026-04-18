---
name: glc
description: Companion skill for the `glc` GitLab CLI. Verify the installed command, run `glc --json doctor` first, then use explicit read-only GitLab commands or `api request` when a high-level verb is missing.
---

# `glc` Companion Skill

Use `glc` for read-oriented GitLab exploration from an agent runtime. Execute it through the available shell or terminal tool; do not assume a dedicated built-in `glc` integration exists.

## First-run order

1. Verify the command exists:

```bash
command -v glc
```

2. Run the preflight check before real reads:

```bash
glc --json doctor
```

3. If `doctor` reports missing setup, configure auth through environment variables or `glc config init`.

## Auth and config

`glc` reads configuration in this order:

1. Environment variables: `GITLAB_HOST`, `GITLAB_TOKEN`, `GITLAB_CACHE_DIR`, `GITLAB_TASK_ID_PATTERN`
2. Global config file from `glc config init`

Use `glc config path` to locate the file and `glc config get` to inspect redacted resolved metadata.

## Safe read path

Prefer explicit high-level commands first:

- `glc groups list|get|tree`
- `glc projects list|get|tree`
- `glc repos tree|refs|file`
- `glc mrs list|get|commits|pipelines|versions|changes|snapshot`
- `glc pipelines list|get`
- `glc jobs list|get|trace`

Use explicit selectors such as `--group`, `--project`, `--mr`, `--pipeline`, and `--job`. Do not assume current-repository context.

## Raw escape hatch

If a read-only GitLab endpoint is missing from the high-level surface, use:

```bash
glc --json api request --path /api/v4/... [--query key=value] [--method GET|HEAD]
```

Only `GET` and `HEAD` are supported. Do not improvise write methods through this command without explicit user approval.

## Guardrails

- Start with `glc --json doctor` in a fresh environment or thread.
- Prefer high-level read commands over `api request`.
- Use `--refresh` only when freshness matters more than cache reuse.
- Use `--json`, `--jsonl`, `--raw`, `--fields`, and `--jq` to keep output bounded and machine-friendly.
- Do not perform writes through GitLab APIs unless the user explicitly asks for that and the CLI surface supports it safely.

## Copy-paste examples

```bash
glc --json doctor
glc projects list --group platform --jq 'select(.path_with_namespace | strings | test("api"; "i"))'
glc --json api request --path /api/v4/projects --query per_page=1
```
