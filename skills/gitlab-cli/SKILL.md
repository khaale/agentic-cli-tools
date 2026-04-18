---
name: glc
description: Agent usage guide for the `glc` GitLab CLI: explore groups, projects, merge requests, pipelines, jobs, and repository content with agent-friendly output and `jq` filtering.
---

# `glc` CLI Usage & Execution

Use `glc` for read-oriented GitLab exploration. In agent runtimes, execute `glc` through the available shell or terminal tool rather than assuming there is a dedicated first-class `glc` tool.

**Primary Identifier Policy:**
Always use `path_with_namespace` as the primary native identifier for searches, filtering, and output. Avoid `name` or simple `path` unless explicitly required.

## Command Model Constraints

Use this command shape:

```text
glc <resource> <verb> [flags]
```

**Common Resources & Verbs:**

- **groups**: `list`, `get`, `tree`
- **projects**: `list`, `get`, `tree`
- **repos**: `tree`, `refs`, `file`
- **mrs**: `list`, `get`, `commits`, `pipelines`, `versions`, `changes`, `snapshot`
- **pipelines**: `list`, `get`
- **jobs**: `list`, `get`, `trace`
- **cache**: `status`, `clear`, `warm`
- **config**: `init`, `get`, `path`

**Always use explicit selectors:**

- `--group <full-path>`
- `--project <path-with-namespace>`
- `--pipeline <id>`
- `--mr <iid>`
- `--job <id>`
- `--version <id|latest>`
- `--ref <name>`
- `--path <repo-path>`

Do not assume implicit current-repository context.

## Output Model & JSONL Handling

- `list` commands default to **JSON Lines (JSONL)**.
- `get` commands default to pretty JSON.
- `tree` commands default to a text tree.
- `trace` commands return raw text.

**CRITICAL: JSON Lines (JSONL) & `jq`**
`glc list` outputs multiple objects, one per line.
1.  `list` commands return all matching rows by default. Use `--limit <n>` only when you explicitly want a capped result set.
2.  **DO NOT use `.[]` to iterate**. Treat each line as a standalone object (e.g., `glc list --jq 'select(...)'`).
3.  **Use `| strings |`** before `test()` to prevent type errors.
4.  **Handle Errors:** If you see `null/boolean cannot be matched`, it means a non-string reached `test()`.

Prefer:
- `--fields` to reduce columns.
- Internal `--jq` for filtering or reshaping rows.
- External `grep` only for simple plain-text narrowing.

## Formatting Flags

- `--json` forces JSON output.
- `--jsonl` forces JSON Lines output.
- `--raw` emits raw scalar values without JSON quotes.
- `--compact` removes indentation from JSON output.
- `--fields a,b,c` projects a smaller field set.
- `--full` emits the full GitLab object instead of the default summary row.
- `--jq <expr>` applies a jq expression to the result before printing.
- `--verbose` enables verbose request logging when supported.
- `--refresh` ignores cached responses.

Use `--raw` when your `--jq` expression returns strings that you intend to pass into a shell loop or another command.

## Recipes

### Find projects by path or keywords (Case-Insensitive)

To find projects where the path contains a specific word:

```bash
glc projects list --jq 'select(.path_with_namespace | strings | test("keyword"; "i")) | .path_with_namespace' --raw
```

### Inspect repository content

List files in a path:
```bash
glc repos tree --project group/project --path src --ref main
```

Read a file:
```bash
glc repos file --project group/project --path README.md --ref main
```

### Inspect merge requests precisely

List recent MRs with specific order:
```bash
glc mrs list --project group/project --state opened --order-by updated_at --sort desc --limit 10
```

Review MR changes with patch:
```bash
glc mrs changes --project group/project --mr 123 --patch
```

Materialize an MR review pack:
```bash
glc mrs snapshot --project group/project --mr 123 --include overview,commits,pipelines,changes,patch --output-dir /tmp/glc-mr-123
```

### Inspect Jobs & Pipelines

List jobs for a pipeline:
```bash
glc jobs list --project group/project --pipeline 456
```

Read job trace:
```bash
glc jobs trace --project group/project --job 789
```

## Runtime Requirements

- Required environment variables: `GITLAB_HOST`, `GITLAB_TOKEN`.
- `jq` must be available in `PATH` when using the internal `--jq` flag.

## Heuristics & Guardrails

- **Start with `list`** and restricted output before requesting details.
- `projects list` already returns the full matching set; add `--limit` only when you need a cap.
- **Use `--refresh`** only when freshness is critical; otherwise, trust the cache.
- **Large Output:** Do not request `--full` on large lists unless you specifically need every field.
- **Tool Hallucination:** Do not assume the runtime exposes `glc` as a dedicated API tool. Use the shell/terminal execution path that the agent runtime provides.
- **Repository Tree Confusion:** Do not use `projects tree` for repository files. Use `repos tree`.
