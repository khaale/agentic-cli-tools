# `glc`

`glc` is a GitLab explorer CLI built for agents and shell users.

It is designed around a few constraints that matter in practice:

- explicit resource-first commands
- no interactive login, prompts, or pagers
- brief default list output instead of full GitLab payloads
- built-in `jq` filtering and projection
- data-only stdout so it works well with pipes
- local JSON-file caching to avoid repeated expensive API reads

The intended use case is exploration and inspection of GitLab groups, projects, repositories, merge requests, pipelines, and jobs, especially from low-grade LLMs and shell scripts.

## Status

This repository currently contains a first working scaffold:

- `doctor`
- `api request`
- `groups list|get|tree`
- `projects list|get|tree`
- `repos tree|refs|file`
- `mrs list|get|commits|pipelines|versions|changes|snapshot`
- `pipelines list|get`
- `jobs list|get|trace`
- `cache status|clear|warm`
- `config init|get|path`

The CLI is GitLab-only and read-oriented in this version.

## Why `glc`

GitLab CLIs tend to be optimized for human operators who already know the product model and are comfortable with mixed modes, aliases, and interactive flows.

`glc` takes a different approach:

- commands follow one stable grammar: `glc <resource> <verb> ...`
- selectors are explicit: `--group`, `--project`, `--pipeline`, `--job`
- list commands return a restricted stable schema by default
- full payloads are opt-in with `--full`
- output can be refined with `--fields` or `--jq`

That makes the next command easier to generate for both people and weaker models.

## Installation

Node.js 22+ is required.

For development in this repo:

```bash
npm install
node ./bin/glc.js
```

Intended package usage:

```bash
npm install -g @khaale/gitlab-cli
glc --help
```

or:

```bash
npx @khaale/gitlab-cli --help
```

Recommended first-run smoke test:

```bash
command -v glc
glc --json doctor
```

## Authentication

`glc` reads GitLab connection settings from either:

- environment variables
- a persisted global JSON config file

Per-key precedence is:

1. `GITLAB_HOST`, `GITLAB_TOKEN`, `GITLAB_CACHE_DIR` from the environment
2. the same keys in the global `config.json`
3. built-in OS-specific cache-dir default for `GITLAB_CACHE_DIR`

The global config lives at:

- Linux: `${XDG_CONFIG_HOME:-~/.config}/glc/config.json`
- macOS: `~/Library/Application Support/glc/config.json`
- Windows: `%APPDATA%\glc\config.json`

Recommended setup:

```bash
export GITLAB_HOST=https://gitlab.example.com
export GITLAB_TOKEN=glpat-xxxxxxxx
glc config init
```

That persists the current values into `config.json`.

You can also write config explicitly:

```bash
glc config init \
  --gitlab-host https://gitlab.example.com \
  --gitlab-token glpat-xxxxxxxx
```

JSON keys use the same names as the environment variables:

```json
{
  "GITLAB_HOST": "https://gitlab.example.com",
  "GITLAB_TOKEN": "glpat-xxxxxxxx"
}
```

Environment variables remain the override path for temporary or session-specific credentials.

```bash
export GITLAB_HOST=https://gitlab.example.com
export GITLAB_TOKEN=glpat-xxxxxxxx
```

PowerShell:

```powershell
$env:GITLAB_HOST="https://gitlab.example.com"
$env:GITLAB_TOKEN="glpat-xxxxxxxx"
```

There is no interactive login or prompt-based config flow in v1.

## Basic Usage

Command shape:

```text
glc <resource> <verb> [flags]
glc doctor [flags]
```

Resources:

- `doctor`
- `api request`
- `groups`
- `projects`
- `repos`
- `pipelines`
- `mrs`
- `jobs`
- `cache`
- `config`

Common selectors:

- `--group <full-path>`
- `--project <path-with-namespace>`
- `--pipeline <id>`
- `--mr <iid>`
- `--job <id>`
- `--version <id|latest>`
- `--ref <name>`
- `--path <repo-path>`

Common output flags:

- `--fields a,b,c`
- `--full`
- `--json`
- `--jsonl`
- `--raw`
- `--compact`
- `--jq '<expression>'`

Common control flags:

- `--limit <n>`
- `--page <n>`
- `--refresh`
- `--verbose`

Read-only raw API flags:

- `api request --path <absolute-api-path>`
- `--method <GET|HEAD>`
- `--query key=value&key2=value2`

Config init flags:

- `--gitlab-host <url>`
- `--gitlab-token <token>`
- `--gitlab-cache-dir <path>`
- `--force`

## Examples

### Configure access

Show the resolved config file path:

```bash
glc config path
```

Run the recommended preflight check:

```bash
glc --json doctor
```

Persist the current env-backed configuration:

```bash
glc config init
```

Inspect the effective config with a redacted token:

```bash
glc config get
```

Use the raw escape hatch for a read-only endpoint:

```bash
glc --json api request --path /api/v4/projects --query per_page=1
```

### Discover groups and projects

List top-level groups:

```bash
glc groups list
```

List subgroups under a group:

```bash
glc groups list --group platform
```

Show a namespace tree:

```bash
glc groups tree --group platform
```

List projects inside a group:

```bash
glc projects list --group platform
```

Inspect one project:

```bash
glc projects get --project platform/api
```

Show a project resource tree:

```bash
glc projects tree --project platform/api
```

### Explore repositories

Browse repository files:

```bash
glc repos tree --project platform/api --ref main
```

Browse a subdirectory:

```bash
glc repos tree --project platform/api --ref main --path src/
```

List repository refs:

```bash
glc repos refs --project platform/api
```

Fetch a file:

```bash
glc repos file --project platform/api --ref main --path package.json
```

### Explore pipelines and jobs

List recent pipelines:

```bash
glc pipelines list --project platform/api --limit 10
```

Inspect one pipeline:

```bash
glc pipelines get --project platform/api --pipeline 8123
```

List jobs in a pipeline:

```bash
glc jobs list --project platform/api --pipeline 8123
```

Inspect one job:

```bash
glc jobs get --project platform/api --job 99123
```

Read a job trace:

### Explore merge requests

List recent opened MRs in a project:

```bash
glc mrs list --project platform/api --state opened --limit 10
```

Inspect one MR overview:

```bash
glc mrs get --project platform/api --mr 123
```

List MR commits:

```bash
glc mrs commits --project platform/api --mr 123
```

List MR pipelines:

```bash
glc mrs pipelines --project platform/api --mr 123
```

Pin review to a diff version and inspect changed files:

```bash
glc mrs versions --project platform/api --mr 123
glc mrs changes --project platform/api --mr 123 --version latest
```

Write a review snapshot to disk:

```bash
glc mrs snapshot --project platform/api --mr 123 --include overview,commits,pipelines,changes,patch --output-dir /tmp/glc-mr-123
```

```bash
glc jobs trace --project platform/api --job 99123
```

## Output Model

The output rules are intentionally simple:

- `list` commands default to JSON Lines
- `get` commands default to pretty JSON
- `tree` commands default to a text tree
- `trace` commands return raw text

Formatting flags control the rendered form:

- `--json`: force JSON object/array output
- `--jsonl`: force JSON Lines output
- `--raw`: emit raw scalar values without JSON quotes
- `--compact`: remove pretty indentation from JSON output
- `--fields a,b,c`: project a smaller field set before rendering
- `--full`: bypass the default summary schema and emit full GitLab objects

Current `--compact` behavior is narrow by design:

- it affects JSON output
- `--raw` is the right choice when `--jq` returns strings for shell loops
- it does not change tree output
- it does not change raw trace/file output
- JSON Lines are already compact one-object-per-line output

List output is intentionally restricted by default. It should provide enough information for the next step, not a full API dump.
List commands return all matching rows by default. Use `--limit <n>` when you want only the first `n` results.

Examples:

```bash
glc projects list --group platform
```

Example row:

```json
{"id":102,"path":"api","path_with_namespace":"platform/api","web_url":"https://gitlab.example.com/platform/api","ssh_url_to_repo":"git@gitlab.example.com:platform/api.git","http_url_to_repo":"https://gitlab.example.com/platform/api.git","last_activity_at":"2026-03-19T08:10:00Z"}
```

Select a smaller schema:

```bash
glc projects list --group platform --fields id,path_with_namespace
```

Request full GitLab objects:

```bash
glc projects list --group platform --full
```

Force pretty JSON instead of JSON Lines for a list:

```bash
glc projects list --group platform --json
```

Force JSON Lines explicitly:

```bash
glc projects list --group platform --jsonl
```

Return compact JSON for a single object:

```bash
glc projects get --project platform/api --compact
```

Combine `--json` and `--fields` on a tree command:

```bash
glc groups tree --group platform --json
```

## Built-in `jq`

`glc` can run `jq` expressions internally through `--jq`. This lets you filter or reshape output without an extra process in the common case.

Examples:

Project projection:

```bash
glc projects list --group platform --jq '{project: .path_with_namespace, last_activity: .last_activity_at}'
```

Only failed pipelines:

```bash
glc pipelines list --project platform/api --jq 'select(.status == "failed")'
```

Compact chaining-friendly output:

```bash
glc jobs list --project platform/api --pipeline 8123 --jq '{id, name, status}' --compact
```

Extract project nodes from a group tree:

```bash
glc groups tree --group platform --json --jq '.. | objects | select(.kind? == "project") | .data.path_with_namespace'
```

Extract raw project paths for a shell loop:

```bash
glc projects list --group platform --jq '.path_with_namespace' --raw
```

`jq` must be available in `PATH`.

## `grep` and pipes

`glc` is designed so stdout contains data only. That makes it work cleanly with shell tools.

Examples:

```bash
glc pipelines list --project platform/api | grep failed
glc jobs trace --project platform/api --job 99123 | grep -n ERROR
glc projects list --group platform --fields path_with_namespace | grep auth
```

## Caching

Read commands use cache automatically unless `--refresh` is passed.

Cache logging is silent by default. Use `--verbose` if you want to see cache-hit diagnostics on `stderr`.

Cache examples:

```bash
glc cache status
glc cache warm --group platform
glc cache clear --project platform/api
glc projects list --group platform --verbose
```

Refresh a command explicitly:

```bash
glc pipelines list --project platform/api --refresh
```

Cache location:

- Linux: `~/.cache/glc/` or `$XDG_CACHE_HOME/glc/`
- macOS: `~/Library/Caches/glc/`
- Windows: `%LocalAppData%/glc/cache/`

## Tests

Run the current test suite:

```bash
npm test
```

Current coverage includes:

- argument parsing
- output mode and field projection
- tree rendering
- JSON-file cache behavior
- CLI help and missing-env error handling

Publishing builds a self-contained `dist/` bundle during `npm run pack:check` and `npm publish`, so the released package does not depend on workspace-only packages.

## Repository Layout

- [bin/glc.js](./bin/glc.js): executable entrypoint
- [src/cli.js](./src/cli.js): command dispatch and top-level runtime
- [src/commands](./src/commands): resource handlers
- [src/lib](./src/lib): shared config, cache, output, jq, and GitLab client logic
- [docs/design.md](./docs/design.md): user-facing design document

## Limitations

Current gaps in this first implementation:

- no write operations
- no interactive auth/config flow
- no retry/backoff policy yet
- no dedicated integration tests against a real GitLab instance
- `--jq` depends on an installed `jq` executable

## Next Steps

Useful next improvements:

- package publishing under a real npm scope
- integration tests with recorded or mocked GitLab API responses
- richer pagination and sorting behavior
- clearer field-profile support for list and tree output
- command-specific help and examples
