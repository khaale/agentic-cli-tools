# Agent Contribution Guide

Welcome, Agent. This repository is designed to be agent-friendly. Follow these guidelines to ensure consistency and correct automated publication.

## Workflow Overview

1.  **Branching**: Always work on a feature branch (e.g., `feat/my-feature` or `fix/issue-name`). DO NOT push directly to `main` unless completing a release or directed by the user.
2.  **Verification**: Before pushing, always run:
    ```bash
    export PATH="/opt/homebrew/bin:$PATH" # Ensure pnpm/node are in path
    pnpm check
    ```
    This runs linting, tests, and dry-run packaging across the entire monorepo.

## Changesets & Versioning

We use **Changesets** to manage versions and changelogs. **Every** user-facing change (feature or fix) MUST include a changeset.

1.  **Generate a Changeset**:
    ```bash
    pnpm changeset
    ```
2.  **Commit the Changeset**: The generated `.md` file in `.changeset/` must be committed with your code.

## Package Structure

- `packages/cli-core`: Shared utilities (config resolution, output formatting).
- `packages/gitlab-cli` (`glc`): GitLab-specific commands.
- `packages/kaiten-cli` (`ktc`): Kaiten-specific commands.
- `skills/`: Markdown files that teach agents how to use these tools. Update these when adding new flags or commands.

## CI/CD Pipeline

- **Validation**: PRs trigger `.github/workflows/ci.yml`.
- **Releases**: Merging to `main` triggers `.github/workflows/release.yml`. If changesets are present, it creates/updates a **"Version Packages"** PR. Merging that PR publishes to NPM.

## Design Philosophy

- **Stable Output**: Prefer machine-readable formats (JSON) when available.
- **Anonymization**: Always summarize/anonymize PII (Personal Identifiable Information) in CLI output as demonstrated in `lib/schemas.js`.
- **Platform Agnostic**: Use `resolveConfigPath` and `resolveDefaultCacheDir` from `cli-core` to resolve paths. NEVER hardcode macOS paths like `Library/Application Support`.
