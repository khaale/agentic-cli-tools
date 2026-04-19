# agentic-cli-tools

Home for an agent-oriented CLI workspace that currently ships two primary tool families:

- `glc`: GitLab exploration and merge-request review workflows
- `ktc`: Kaiten task exploration workflows

This repository is meant to keep the tools and their agent-facing usage instructions together. The CLI packages live under `packages/`, and the colocated agent skills that teach models how to use them live under `skills/`.

Specifications live under `docs/specs/`.

## Repository Layout

- `packages/`: published CLI packages and shared internal runtime code
- `skills/`: agent-facing skill definitions that document how to use the CLIs effectively
- `scripts/`: workspace automation such as local install helpers and publish-time bundling
- `docs/specs/`: product and implementation specs

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
