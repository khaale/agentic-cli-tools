# agentic-harness

Home for the shared agent-oriented CLI workspace that will absorb `glc`, `ktc`, and later related tools.

Specifications live under `docs/specs/`.

## Dev Install

To create development commands for `glc` and `ktc` under `~/.local/bin/`:

```bash
pnpm dev:install
export PATH="$HOME/.local/bin:$PATH"
```

That gives you direct `glc` and `ktc` commands without typing `node ...`.
