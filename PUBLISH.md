# Publishing Guide

This monorepo uses **Changesets** for version management and **GitHub Actions** for automated publication to NPM via **Trusted Publishing (OIDC)**.

## 1. Documenting Changes

When you make a change that warrants a new release (fix, feature, or breaking change), you must create a "changeset":

```bash
pnpm changeset
```

Follow the interactive prompts:
1. Select which packages are affected (use space to toggle).
2. Choose the version bump type (patch, minor, or major).
3. Enter a summary of the changes (this will go into `CHANGELOG.md`).

A new `.md` file will be created in the `.changeset/` directory. Commit this file along with your changes.

## 2. Automated Release Workflow

Our CI/CD pipeline handles the actual versioning and publishing:

### Stage A: The Release PR
When changesets are merged into the `main` branch, the **Release** GitHub Action (`release.yml`) will:
1. Create a "Version Packages" Pull Request.
2. This PR shows the upcoming versions and updated changelogs.
3. It aggregates all pending changesets.

### Stage B: Publication
When you merge the "Version Packages" PR into `main`:
1. The GitHub Action runs again.
2. It detects that versions have changed and runs `pnpm release` (which calls `pnpm changeset publish`).
3. Packages are published to NPM.
4. GitHub Releases are automatically created.

## 3. NPM Trusted Publishing Setup (OIDC)

We use **Trusted Publishing** to avoid manual 2FA/OTP friction and eliminate long-lived "secret" tokens.

For each public package (e.g., `@khaale/gitlab-cli`, `@khaale/kaiten-cli`), go to **NPM -> Settings -> Publishing -> Trusted Publishers** and add a new "GitHub Actions" publisher:

- **GitHub Organization**: `khaale` (or your org)
- **Repository**: `agentic-cli-tools`
- **Workflow filename**: `release.yml`
- **Environment**: (leave empty)

This allows the specific GitHub Action to authenticate directly with NPM for that package.

## 4. Manual Verification

If you ever need to check if everything is ready without publishing:

```bash
pnpm changeset status
```

To see what versions would be bumped:

```bash
pnpm changeset version
```
*(Warning: this modifies package.json files; don't commit unless you are doing it manually)*
