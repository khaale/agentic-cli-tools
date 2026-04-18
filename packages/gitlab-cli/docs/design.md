# `glc` Design Document

## Summary

`glc` is a GitLab-native console tool designed for agents and shell users who need predictable, non-interactive access to groups, projects, repositories, pipelines, and jobs.

The goal is not to be a full replacement for every GitLab UI workflow. The goal is to make exploration and inspection easy for weak LLMs and shell scripts:

- simple resource-first commands
- explicit selectors instead of hidden context
- brief default output instead of raw GitLab payloads
- built-in `jq` queries for shaping/filtering
- external `grep` compatibility
- automatic caching to avoid refetching large GitLab hierarchies

The tool should feel closer to `kubectl get ... -o json | jq ...` than to a human-oriented interactive CLI.

## Related Docs

- `docs/merge-requests.md`: proposal for first-class merge request support and agentic review snapshots

## Product Goals

- Make common GitLab read flows easy to compose by low-grade LLMs such as Qwen-30B.
- Avoid cryptic syntax, aliases, and interactive flows.
- Return stable data contracts that are short enough to be useful by default.
- Make it cheap to inspect large GitLab installations through cache-backed reads.
- Let users refine output with built-in `jq` and standard shell tools.

## Non-Goals

- Full GitLab administration surface in v1.
- Interactive login, pagers, fuzzy finders, or prompts.
- Heavy local workspace/session state.
- Embedded `grep` semantics.

## Design Principles

### 1. Resource-first grammar

Commands follow a simple pattern:

```text
glc <resource> <verb> [selectors] [filters] [output flags]
```

Examples:

```bash
glc groups list --group platform
glc groups tree --group platform
glc projects list --group platform
glc projects tree --project my-group/api
glc repos tree --project my-group/api --ref main --path src/
glc pipelines list --project my-group/api
glc jobs list --project my-group/api --pipeline 8123
```

### 2. No hidden context

Commands should not depend on the current git remote, a prior `use` command, or an interactive session. Explicit selectors are preferred:

- `--group`
- `--project`
- `--pipeline`
- `--job`
- `--ref`
- `--path`

### 3. Brief by default

Current GitLab APIs often return large nested payloads. `glc` should not do that by default.

List commands return a curated, stable summary schema. Full objects are opt-in via `--full`, and partial expansion is opt-in via `--fields`.

### 4. Data-only stdout

- `stdout` contains only result data.
- `stderr` contains warnings, cache notes, auth hints, and retry information.

This keeps the tool pipe-friendly for both `jq` and `grep`.

### 5. Real jq, not jq-like

When the tool offers query support, it should execute real jq-compatible expressions. Users and agents should not have to learn a second filtering language.

## Technical Shape

### Naming

There are two separate naming problems:

- the command users and agents type
- the npm package name used for installation

These do not need to be the same.

Recommendation:

- keep the command name as `glc`
- publish the npm package under a scope, for example `@your-org/glc`

Why this is the best default:

- `glc` is short and easy for agents to repeat
- a scoped package avoids collisions in the global npm namespace
- documentation can still use one canonical command everywhere

Recommended install examples:

```bash
npm install -g @your-org/glc
glc projects list --group platform
```

```bash
npx @your-org/glc projects list --group platform
```

If an unscoped package is required, prefer a descriptive package name and keep `glc` as the installed binary if possible.

Good unscoped candidates:

- `gitlab-console-cli`
- `gitlab-query-cli`
- `gitlab-explorer-cli`
- `gitlab-inspect-cli`

For agents, the command name matters more than the package name once the tool is installed. A short canonical command is better than exposing multiple aliases.

### Runtime and distribution

- Implementation language: JavaScript/TypeScript in the Node.js ecosystem
- Node baseline: Node.js 22+
- Distribution: a single npm package exposing a `glc` binary
- Invocation style:

```bash
npx @your-org/glc ...
```

or:

```bash
npm install -g @your-org/glc
glc ...
```

This is chosen because npm distribution is simple for users and common in agent environments.

### Auth and host configuration

V1 assumes the host and token are already present in environment variables.

```bash
export GITLAB_HOST=https://gitlab.example.com
export GITLAB_TOKEN=glpat-xxxxxxxx
```

The CLI should not require an interactive `login` command in v1.

If the variables are missing, commands should fail with a short actionable error on `stderr`.

### Cache backend

The cache uses JSON files stored under the platform cache directory.

Examples:

- Linux: `$XDG_CACHE_HOME/glc/` or `~/.cache/glc/`
- macOS: `~/Library/Caches/glc/`
- Windows: `%LocalAppData%/glc/cache/`

Why JSON files:

- easy to inspect manually
- simple packaging with no database dependency
- enough for cache-backed browsing in v1

The cache should store:

- request key
- fetched timestamp
- TTL / freshness metadata
- normalized response payload

## Core Resources

### Groups

```text
glc groups list
glc groups get
glc groups tree
```

Purpose:

- discover namespaces
- inspect a single group
- walk groups, subgroups, and projects recursively

`groups tree` means namespace hierarchy. It is not a flat recursive list and not a health dashboard.

Example:

```bash
glc groups tree --group platform
```

Default text output could look like:

```text
platform
├─ platform/core
│  ├─ project api-gateway
│  └─ project auth-service
└─ platform/data
   └─ project ingestion
```

Machine-friendly form:

```bash
glc groups tree --group platform --json
```

### Projects

```text
glc projects list
glc projects get
glc projects tree
```

Purpose:

- find projects inside a group or by search
- inspect a single project
- explore the major GitLab entities connected to a project

`projects tree` means project resource exploration, not repository file browsing.

Example:

```bash
glc projects tree --project platform/api
```

Possible default text output:

```text
platform/api
├─ refs
│  ├─ branch main
│  └─ branch release/2026.03
├─ pipelines
│  ├─ pipeline 8123 failed
│  └─ pipeline 8122 success
└─ jobs
   ├─ build failed
   └─ test skipped
```

### Repositories

```text
glc repos tree
glc repos refs
glc repos file
```

Purpose:

- browse repository file trees
- list branches/tags
- fetch a file at a specific ref

`repos tree` is the repository file tree. This is intentionally separate from `projects tree`.

Example:

```bash
glc repos tree --project platform/api --ref main --path src/
```

### Pipelines

```text
glc pipelines list
glc pipelines get
```

Purpose:

- inspect recent pipeline activity
- fetch details for one pipeline

Example:

```bash
glc pipelines list --project platform/api --limit 10
```

### Jobs

```text
glc jobs list
glc jobs get
glc jobs trace
```

Purpose:

- inspect jobs for a pipeline or project
- fetch one job
- read its trace/log

Example:

```bash
glc jobs list --project platform/api --pipeline 8123
```

## Output Model

### Default output by command type

- `list` commands: JSON Lines with a restricted stable field set
- `get` commands: pretty JSON object
- `tree` commands: text tree by default, JSON/JSONL with explicit flags
- `trace` commands: raw text

This split gives brief default data for scripts while keeping tree views readable for discovery.

### Why list commands should be restricted by default

The default should answer "what are the few fields I need to decide the next command?" rather than "dump everything GitLab sent."

That matters for:

- low-grade LLM token budget
- human scan speed
- cache size
- fewer downstream `jq` projections for common cases

### Default fields

The exact fields must be documented and stable.

Suggested defaults:

#### `groups list`

```json
{"id":17,"path":"core","path_with_namespace":"platform/core","web_url":"https://gitlab.example.com/platform/core"}
```

#### `projects list`

```json
{"id":102,"path":"api","path_with_namespace":"platform/api","web_url":"https://gitlab.example.com/platform/api","ssh_url_to_repo":"git@gitlab.example.com:platform/api.git","http_url_to_repo":"https://gitlab.example.com/platform/api.git","last_activity_at":"2026-03-19T08:10:00Z"}
```

#### `pipelines list`

```json
{"id":8123,"project":"platform/api","ref":"main","status":"failed","source":"push","sha":"a1b2c3d4","created_at":"2026-03-19T07:58:11Z","web_url":"https://gitlab.example.com/platform/api/-/pipelines/8123"}
```

#### `jobs list`

```json
{"id":99123,"pipeline_id":8123,"name":"build","stage":"build","status":"failed","ref":"main","duration":46.2,"web_url":"https://gitlab.example.com/platform/api/-/jobs/99123"}
```

#### `repos tree`

```json
{"path":"src/index.ts","type":"blob","size":1821}
{"path":"src/lib","type":"tree"}
```

### Expansion controls

Users can request more data explicitly:

```bash
glc projects list --group platform --fields id,path_with_namespace,last_activity_at
glc projects list --group platform --full
glc pipelines get --project platform/api --pipeline 8123
```

Recommended global flags:

- `--json`
- `--jsonl`
- `--raw`
- `--compact`
- `--fields`
- `--full`
- `--limit`
- `--page`
- `--refresh`
- `--jq`

## jq Integration

### Principle

The CLI should run real jq-compatible expressions internally, using a dedicated flag such as `--jq`.

This avoids unnecessary process pipelines for common filtering/projection while keeping syntax familiar. When the jq result is a scalar string intended for shell piping, `--raw` should emit plain unquoted lines.

### Example: project projection

```bash
glc projects list --group platform --jq '{project: .path_with_namespace, last_activity: .last_activity_at}'
```

Possible output:

```json
{"path":"platform/api","branch":"main"}
{"path":"platform/auth","branch":"main"}
```

### Example: filter failed pipelines

```bash
glc pipelines list --project platform/api --jq 'select(.status == "failed")'
```

### Example: compact output for chaining

```bash
glc jobs list --project platform/api --pipeline 8123 --jq '{id, name, status}' --compact
```

### Example: tree in JSON plus jq

```bash
glc groups tree --group platform --json --jq '.. | objects | select(.kind? == "project") | .data.path_with_namespace'
```

## grep Usage

`grep` stays external. The CLI should not embed text-search syntax beyond structured filters and jq.

Examples:

```bash
glc pipelines list --project platform/api | grep failed
glc jobs trace --project platform/api --job 99123 | grep -n ERROR
glc projects list --group platform --fields path_with_namespace | grep auth
```

This works because `stdout` is reserved for raw data and does not contain headers, spinners, or prose.

## Filters and Selectors

Common selectors:

- `--group <full-path>`
- `--project <path-with-namespace>`
- `--pipeline <id>`
- `--job <id>`
- `--ref <name>`
- `--path <repo-path>`

Common filters:

- `--search <text>`
- `--state <value>`
- `--sort <field>`
- `--limit <n>`
- `--page <n>`

Examples:

```bash
glc projects list --group platform --search auth
glc pipelines list --project platform/api --state failed --limit 5
glc repos refs --project platform/api --search release/
```

## Cache and Freshness

### Default behavior

Read commands should use cache automatically when data is still valid.

The user should not need to think about caching during normal exploration.

### Refresh behavior

When the user wants fresh data:

```bash
glc projects list --group platform --refresh
glc pipelines get --project platform/api --pipeline 8123 --refresh
```

### Cache commands

Recommended commands:

```text
glc cache status
glc cache clear
glc cache warm
```

Examples:

```bash
glc cache status
glc cache warm --group platform
glc cache clear --project platform/api
```

### Freshness signals

Freshness information should go to `stderr` when useful, for example:

```text
cache hit: projects list group=platform age=84s ttl=300s
```

That should be opt-in via a verbose/debug mode so normal command output stays quiet in interactive shells and pipelines.

## Error Model

Errors should be short, explicit, and actionable.

Examples:

```text
missing required environment variable: GITLAB_TOKEN
```

```text
project not found: platform/unknown-service
```

```text
jq query error: unexpected end of input
```

```text
gitlab request failed: 429 rate limited
```

Recommended exit code classes:

- `0`: success
- `2`: bad arguments / invalid jq
- `3`: auth or missing env
- `4`: not found
- `5`: remote/API failure

## Example Workflows

### Explore an unfamiliar namespace

```bash
glc groups tree --group platform
glc projects list --group platform
glc projects list --group platform --jq '.path_with_namespace'
```

### Find failing pipelines

```bash
glc pipelines list --project platform/api --state failed
glc pipelines list --project platform/api --jq 'select(.status == "failed") | {id, ref, created_at}'
glc jobs list --project platform/api --pipeline 8123
```

### Inspect repository structure

```bash
glc repos tree --project platform/api --ref main
glc repos tree --project platform/api --ref main --path src/
glc repos file --project platform/api --ref main --path package.json
```

### Traverse project resources

```bash
glc projects tree --project platform/api
glc projects tree --project platform/api --json
```

### Warm cache before a large session

```bash
glc cache warm --group platform
glc projects list --group platform
glc pipelines list --project platform/api
```

## Why This Is Better for Agents Than `glab`

- Fewer verbs and fewer special cases
- Explicit resource naming
- No reliance on interactive flows
- Stable default schemas instead of large API dumps
- Real jq support built into the tool
- Caching that reduces repeated expensive traversal
- Output contracts that are easy for both shell and LLM consumption

## Implementation Notes

The document is user-facing, but the following implementation constraints drive the UX and should stay consistent:

- Node.js 22+
- npm package with a `glc` binary
- environment-variable auth only in v1
- JSON-file cache under OS cache directory
- real jq-compatible evaluation behind `--jq`
- GitLab-only resource model in v1
- read-oriented surface in v1, except cache management
