# `ktc`

`ktc` is a Kaiten explorer CLI built for agents and shell users.

It is designed around a few constraints that matter in practice:

- explicit noun-verb commands
- no interactive login, prompts, or pagers
- read-only access in this version
- brief default output instead of full API dumps
- stable machine-readable JSON when requested
- Markdown output that is compact and agent-friendly by default
- local JSON-file caching to avoid repeated expensive API reads
- anonymized user-identifying fields in output

The intended use case is exploration and inspection of Kaiten cards from shells, scripts, and LLM-driven workflows.

## Status

This repository currently contains a first working scaffold:

- `doctor`
- `api request`
- `tasks mine`
- `tasks find`
- `tasks get`
- `task-comments get`

The CLI is Kaiten-only and read-oriented in this version.

Current implementation notes:

- `tasks mine` resolves the current user through `GET /api/latest/users/current`
- `tasks mine` and `tasks find` use `GET /api/latest/cards`
- `tasks get` uses `GET /api/latest/cards/{card_id}`
- `tasks get` keeps a broader board-scan fallback if direct lookup does not resolve

## Why `ktc`

Product CLIs often assume a human operator who already knows the model well and is comfortable with mixed modes, aliases, and interactive flows.

`ktc` takes a different approach:

- commands follow one stable grammar: `ktc tasks <verb> ...`
- selectors are explicit: `--space`, `--board`, `--assignee`
- positional arguments are used only where they simplify the obvious case
- output defaults to a concise readable task view
- JSON is opt-in with `--json`
- output can be narrowed with `--fields`

That makes the next command easier to generate for both people and weaker models.

## Installation

Node.js 22+ is required.

For development in this repo:

```bash
npm install
node ./bin/ktc.js --help
```

Intended package usage:

```bash
npm install -g @khaale/kaiten-cli
ktc --help
```

or:

```bash
npx @khaale/kaiten-cli --help
```

Recommended first-run smoke test:

```bash
command -v ktc
ktc --json doctor
```

## Publishing

The package metadata is set up so publishing only includes the built runtime files:

- `dist/`
- `README.md`
- `LICENSE`

`npm run pack:check` and `npm publish` build a self-contained bundle into `dist/` before packaging, so the published tarball does not depend on workspace-only packages.

Before publishing:

1. Confirm the package name in [package.json](/Users/aleksander_khanteev/Documents/projects/khaale/agentic-cli-tools/packages/kaiten-cli/package.json) is the one you want on npm.
2. Run:

```bash
npm run lint
npm test
npm run pack:check
```

3. Inspect the `npm pack --dry-run` output and make sure no local-only files are included.
4. Publish:

```bash
npm publish
```

`prepublishOnly` already runs lint, tests, and the dry-run pack check before a real publish.

## Authentication

`ktc` reads Kaiten connection settings from either:

- environment variables
- a persisted global JSON config file

Per-key precedence is:

1. `KAITEN_URL`, `KAITEN_API_TOKEN`, `KAITEN_API_BASE`, `KAITEN_BROKEN_API`, `KAITEN_CACHE_DIR` from the environment
2. the same keys in the global `config.json`
3. built-in OS-specific cache-dir default for `KAITEN_CACHE_DIR`

The global config lives at:

- Linux: `${XDG_CONFIG_HOME:-~/.config}/ktc/config.json`
- macOS: `~/Library/Application Support/ktc/config.json`
- Windows: `%APPDATA%\ktc\config.json`

Recommended setup:

```bash
export KAITEN_URL=https://your-domain.kaiten.ru
export KAITEN_API_TOKEN=your-token
ktc config init
```

Optional:

```bash
export KAITEN_API_BASE=/api/latest
```

You can also persist config explicitly:

```bash
ktc config init \
  --kaiten-url https://your-domain.kaiten.ru \
  --kaiten-api-token your-token
```

There is no interactive login flow in v1.

## Basic Usage

Command shape:

```text
ktc tasks <mine|find|get> [args] [flags]
ktc task-comments get [args] [flags]
ktc doctor [flags]
ktc api request [flags]
```

Nouns:

- `doctor`
- `api request`
- `tasks`
- `task-comments`
- `config`

Verbs:

- `mine`
- `find`
- `get`

Common selectors:

- `--space <id|uid|title>`
- `--board <id|uid|title>`
- `--assignee <me|id|uid|email|username|name>`

Common filters:

- `--search <text>`
- `--state <open|done|archived|all>`
- `--limit <n>`

Common output flags:

- `--fields a,b,c`
- `--json`
- `--md`
- `--raw`
- `--compact`

Common control flags:

- `--refresh`
- `--verbose`

## Examples

### Explore your work

Run the recommended preflight check:

```bash
ktc --json doctor
```

List your open tasks:

```bash
ktc tasks mine
```

The same in JSON:

```bash
ktc tasks mine --json
```

### Find tasks

Find tasks by text:

```bash
ktc tasks find auth
```

Find tasks assigned to you:

```bash
ktc tasks find --assignee me --search auth
```

Find tasks for another assignee:

```bash
ktc tasks find --assignee alice --state open
```

Narrow the search to a space or board:

```bash
ktc tasks find --space Engineering --board Backend
```

### Inspect one task

Get one task by id:

```bash
ktc tasks get --id 9001
```

Debug a slow request:

```bash
ktc tasks get --id 9001 --verbose
```

### Inspect task comments

Get comments for a task:

```bash
ktc task-comments get --task 9001
```

Use the raw escape hatch for a read-only endpoint:

```bash
ktc --json api request --path /api/latest/spaces --query query=platform
```

## Output Model

The output rules are intentionally simple:

- `mine` defaults to Markdown
- `find` defaults to Markdown
- `get` defaults to Markdown

Formatting flags control the rendered form:

- `--json`: force JSON output
- `--md`: force Markdown output
- `--compact`: remove indentation from JSON output
- `--fields a,b,c`: project a smaller field set before rendering

Markdown output is intended to be readable by both humans and agents. Task detail output includes:

- core task facts
- anonymized assignee information
- brief parent and child task summaries when present

JSON output keeps the full structured object. User-identifying fields are anonymized before rendering:

- Markdown and debug logs use shortened `sha256:` prefixes
- JSON keeps the full `sha256:` value
- the hash is deterministic for the same normalized input value

List output is intentionally restricted by default. It should provide enough information for the next step, not a full API dump.

Examples:

```bash
ktc tasks mine
ktc tasks find auth --json
ktc tasks get --id 9001
```
