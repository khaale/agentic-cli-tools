# Self-Contained CLI Packages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make published `@khaale/gitlab-cli` and `@khaale/kaiten-cli` installable without publishing `@khaale/cli-core` as a separate npm package.

**Architecture:** Keep `packages/cli-core` as an internal workspace package for development, but bundle each CLI into a self-contained `dist/` output before packing/publishing. Published package metadata will point `bin` and module entrypoints at bundled files so tarballs no longer require `workspace:*` dependencies.

**Tech Stack:** Node.js 22, pnpm workspaces, npm pack, esbuild

---

### Task 1: Add a regression test for packed package metadata

**Files:**
- Modify: `packages/gitlab-cli/test/cli.test.js`
- Modify: `packages/kaiten-cli/test/cli.test.js`

- [ ] **Step 1: Write the failing test**

Add one test per CLI that bundles the package metadata expectation into a pack-oriented assertion: published metadata must not reference `workspace:*` for `@khaale/cli-core`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/gitlab-cli/test/cli.test.js packages/kaiten-cli/test/cli.test.js`
Expected: FAIL because current package metadata still uses `workspace:*`.

- [ ] **Step 3: Write minimal implementation**

Introduce packaging changes so published metadata is emitted from bundled output instead of raw workspace metadata.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/gitlab-cli/test/cli.test.js packages/kaiten-cli/test/cli.test.js`
Expected: PASS.

### Task 2: Bundle each CLI into a publishable self-contained dist

**Files:**
- Modify: `packages/gitlab-cli/package.json`
- Modify: `packages/kaiten-cli/package.json`
- Create: `packages/gitlab-cli/scripts/build.mjs`
- Create: `packages/kaiten-cli/scripts/build.mjs`

- [ ] **Step 1: Add build scripts**

Use `esbuild` to bundle each CLI entrypoint into `dist/cli.js` and `dist/bin/<tool>.js`.

- [ ] **Step 2: Point packed package metadata at dist**

Set published `bin`, `exports`/`main`, and `files` to use `dist` so tarballs become self-contained and do not expose workspace-only dependencies.

- [ ] **Step 3: Hook build into pack/publish flow**

Ensure `pack:check` and `prepublishOnly` build fresh `dist` assets before `npm pack`.

### Task 3: Verify tarballs and docs

**Files:**
- Modify: `packages/gitlab-cli/README.md`
- Modify: `packages/kaiten-cli/README.md`

- [ ] **Step 1: Update release/dev docs**

Document that publishable artifacts are built into `dist/` before packing.

- [ ] **Step 2: Run verification**

Run: `pnpm test`
Expected: PASS.

Run: `pnpm -r pack:check`
Expected: PASS with bundled `dist` contents included.

- [ ] **Step 3: Inspect tarballs**

Run: `tar -xOf packages/gitlab-cli/*.tgz package/package.json` and `tar -xOf packages/kaiten-cli/*.tgz package/package.json`
Expected: no `workspace:*` dependency on `@khaale/cli-core`.
