---
name: ktc
description: Kaiten task explorer CLI for listing your tasks, finding cards, and getting task details in Markdown or JSON.
---

# `ktc` CLI Usage & Execution

Use `ktc` for read-only Kaiten task exploration.

## Command Model Constraints

Use this command shape:

```text
ktc task <mine|find|get> [args] [flags]
```

**Common Resources & Verbs:**

- **task**: `mine`, `find`, `get`
- **config**: `init`, `get`, `path`

### Task Selectors & Filters

- `--space <id|uid|title>`: Filter by space.
- `--board <id|uid|title>`: Filter by board.
- `--assignee <me|id|uid|email|username|name>`: Filter by assignee (`me` for current user).
- `--search <text>`: Search text in tasks.
- `--state <open|done|archived|all|active>`: Filter by state (`active` is an alias for `open`).
- `--limit <n>`: Maximum number of tasks to return.
- `--id <task-id>`: (Required for `get`) Specific task ID.

**Note on `task find`:** You can also pass search terms as positional arguments at the end of the command.

### Output & Runtime Flags

- `--json`: Force JSON output.
- `--md`: Force Markdown output (default).
- `--compact`: Use compact JSON output.
- `--fields a,b,c`: Comma-separated fields to project.
- `--refresh`: Ignore cached responses.
- `--verbose`: Enable verbose request logging.

## Recipes

### List my open tasks

```bash
ktc task mine
```

### Find tasks by text in a specific board

```bash
ktc task find --board "Backend" "auth system"
```

### Find tasks assigned to me in a space

```bash
ktc task find --assignee me --space "Platform"
```

### Get detailed task information

```bash
ktc task get --id 9001 --json
```

## Environment Requirements

- `KAITEN_URL`: Kaiten base URL.
- `KAITEN_API_TOKEN`: Kaiten API token.

## Guardrails

- This version is read-only.
- Default output is Markdown.
- Use `--json` when the result will be piped into another machine step.
- `task mine` resolves the current user automatically.
- Use `--refresh` when you suspect the cache is stale.
