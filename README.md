# agentic cli tools

Home for agent-oriented CLI tools designed for machine-to-machine and machine-to-human workflows.

## Published Packages

The following packages are available on npm under the `@khaale` scope:

| Command | Full Package Name | Description |
|:---|:---|:---|
| `glc` | [`@khaale/gitlab-cli`](https://www.npmjs.com/package/@khaale/gitlab-cli) | GitLab exploration and merge-request review workflows |
| `ktc` | [`@khaale/kaiten-cli`](https://www.npmjs.com/package/@khaale/kaiten-cli) | Kaiten task exploration workflows |

## Installation

You can install these tools globally using your preferred package manager:

```bash
# Using npm
npm install -g @khaale/gitlab-cli @khaale/kaiten-cli

# Using pnpm
pnpm add -g @khaale/gitlab-cli @khaale/kaiten-cli
```

Alternatively, you can run them directly without installation using `npx`:

```bash
npx @khaale/gitlab-cli --help
npx @khaale/kaiten-cli --help
```

## Repository Layout

- `packages/`: published CLI packages and shared internal runtime code
- `skills/`: agent-facing skill definitions that document how to use the CLIs effectively
- `scripts/`: workspace automation such as local install helpers and publish-time bundling
- `docs/specs/`: product and implementation specs

This repository keeps the tools and their agent-facing usage instructions together. The CLI packages live under `packages/`, and the colocated agent skills that teach models how to use them live under `skills/`.

## Agent-First Usage

The primary goal of this repo is not only to publish shell tools, but also to make those tools easy for coding agents to use correctly.

That means:

- the CLIs are designed to return stable, agent-friendly output
- the skills are versioned next to the tools they describe
- changes to command behavior and changes to agent guidance can evolve together in one place

## Dev Install

To create development commands for `glc` and `ktc` under `~/.local/bin/`:

```bash
pnpm dev:install
export PATH="$HOME/.local/bin:$PATH"
```

That gives you direct `glc` and `ktc` commands without typing `node ...`.
