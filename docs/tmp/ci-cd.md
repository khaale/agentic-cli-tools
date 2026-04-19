I'd like to set up CI/CD (publish) github-based pipeline for my project: https://github.com/khaale/agentic-cli-tools . how could it be organised in terms of branches, jobs etc? what options are available in github for free tier? will it be possible to publish from github (main question there is a npm 2fa)

---

Yes — for this repo, GitHub can handle both CI and publish, and the cleanest setup is a small monorepo pipeline with one protected `main` branch, PR validation, and npm trusted publishing from GitHub Actions. That fits your repo well because it is already a public pnpm workspace on Node `>=22`, with a private shared package (`@khaale/cli-core`) and two publishable public packages, `@khaale/gitlab-cli` and `@khaale/kaiten-cli`; the root `check` script already runs recursive lint, test, and pack checks, and the public packages already declare `publishConfig.access: "public"`. ([GitHub Docs][1])

I would organize branches like this:

* `main`: always releasable; no direct pushes.
* short-lived `feat/*`, `fix/*`, `chore/*` branches: merged by PR.
* no long-lived `develop` branch unless the project gets much busier.
* for releases, use either a release PR flow or tags/releases from `main`.

For a repo this size, `develop` usually adds more friction than value. A protected `main` plus required checks is the simplest setup. GitHub Free gives public repos the full feature set, and rulesets for public repos are available on GitHub Free, so you can enforce PR-only merges, required checks, and even tag rules if you want. ([GitHub Docs][1])

The job layout I’d use is:

1. `ci.yml` on `pull_request` and `push` to `main`

   * checkout
   * setup Node + pnpm cache
   * `pnpm install --frozen-lockfile`
   * `pnpm check`
   * optionally run a small matrix on Node 22 and 24

2. `release.yml` on `push` to `main`

   * recommended for your monorepo: use Changesets to create/update a release PR, bump only changed packages, and keep changelogs sane in one repo. Changesets explicitly supports monorepos, has a GitHub Action for release PRs/publishing, and pnpm documents a Changesets flow for workspaces. ([GitHub][2])

3. `publish.yml`

   * trigger after the release PR merges, or on a GitHub Release / version tag
   * publish only the changed public packages
   * optionally put this job behind a GitHub Environment called `npm` for manual approval before publish

GitHub Environments, environment secrets, and deployment protection rules are available in public repos on all current GitHub plans, and wait timers / required reviewers are available for public repos on Free/Pro/Team plans. ([GitHub Docs][3])

For GitHub Free specifically, your public repo is in the best case: standard GitHub-hosted runners are free for public repositories, and GitHub Free personal accounts get unlimited public repos with the full feature set. If you later make the repo private, the included quota on GitHub Free is 2,000 Actions minutes/month, 500 MB Actions storage, 500 MB GitHub Packages storage, and 1 GB GitHub Packages data transfer per month. GitHub Packages usage itself is free for public packages. ([GitHub Docs][4])

On the npm 2FA question: yes, publishing from GitHub is possible, and today the best answer is npm trusted publishing with OIDC rather than storing an npm publish token in GitHub. npm’s docs say publishing now requires either 2FA on the account or a granular token with bypass-2FA enabled, but for CI/CD they recommend trusted publishing, which uses OIDC and avoids long-lived tokens. Trusted publishing currently supports GitHub Actions on GitHub-hosted runners, and the workflow needs `id-token: write` plus `contents: read`. ([npm Docs][5])

A few important npm/OIDC details for your repo:

* trusted publishing requires npm CLI `11.5.1+` and Node `22.14.0+` on the publish runner; your repo already targets Node `>=22`, so that is compatible, but I would pin the publish job to a current Node 22.14+ or 24 image. ([npm Docs][6])
* OIDC only covers `npm publish`; it does not cover `npm install`, `npm view`, `npm access`, etc. Those still need traditional auth if you use private npm dependencies later. ([npm Docs][6])
* with trusted publishing from GitHub Actions, npm automatically generates provenance attestations for public packages published from public repos. Your repo is public, so you can benefit from that. ([npm Docs][6])
* if you enable npm’s stricter “disallow tokens” setting, trusted publishers still work, because that setting only affects traditional token auth. ([npm Docs][6])

One repo-specific thing to fix before enabling trusted publishing: npm says the package’s `repository.url` in `package.json` must exactly match the GitHub repository for publishing from GitHub, and your publishable package manifests currently do not include a `repository` field. Add that to both `packages/gitlab-cli/package.json` and `packages/kaiten-cli/package.json` first. ([npm Docs][6])

A good practical setup for you would be:

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [22, 24]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: pnpm
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - run: pnpm check
```

```yaml
# .github/workflows/publish.yml
name: Publish

on:
  push:
    branches: [main]

permissions:
  contents: read
  id-token: write

jobs:
  publish:
    runs-on: ubuntu-latest
    environment: npm
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          registry-url: https://registry.npmjs.org
          cache: pnpm
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - run: pnpm check
      # either changesets action or your own selective publish command here
```

For release orchestration, you have two realistic options:

* **Recommended:** Changesets release PR flow. Best for your monorepo because `gitlab-cli` and `kaiten-cli` can version independently while `cli-core` stays private. This is the lowest-maintenance path once set up. ([GitHub][2])
* **Simpler but more manual:** manual tags / GitHub Releases from `main`, with `publish.yml` triggered on release/tag. GitHub’s Node publishing docs show release-triggered npm publish as a standard pattern. ([GitHub Docs][7])

One more caveat: with npm trusted publishing, avoid hiding the actual publish inside a deeply reusable workflow unless you really need to. npm notes that for `workflow_call`/`workflow_dispatch` setups, validation may check the calling workflow name, which can cause mismatches, and `id-token: write` must be present in both parent and child workflows. Keeping publish in one top-level workflow file is simpler. ([npm Docs][6])

You also asked about “publish from GitHub” more generally. There are two destinations:

* **npmjs**: best for public CLI distribution.
* **GitHub Packages**: also possible. Public packages are free there too, and inside GitHub Actions you can publish to GitHub Packages using `GITHUB_TOKEN` with `packages: write`. Outside Actions, GitHub Packages authentication is still based on classic PATs. ([GitHub Docs][8])

My concrete recommendation for `agentic-cli-tools` is:

* protect `main`
* require the `CI / verify` check
* use one `npm` environment for publish approval
* add `repository.url` to both publishable packages
* adopt Changesets for release PRs
* use npm trusted publishing with OIDC on GitHub-hosted runners
* publish only from `main`, never from feature branches

That gives you a secure pipeline, works on GitHub Free for a public repo, and avoids the usual npm 2FA/token pain entirely.

[1]: https://docs.github.com/get-started/learning-about-github/githubs-products "GitHub's plans - GitHub Docs"
[2]: https://github.com/changesets/changesets?utm_source=chatgpt.com "changesets/changesets: 🦋 A way to manage your ..."
[3]: https://docs.github.com/actions/deployment/targeting-different-environments/using-environments-for-deployment "Managing environments for deployment - GitHub Docs"
[4]: https://docs.github.com/en/actions/concepts/billing-and-usage "Billing and usage - GitHub Docs"
[5]: https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/?utm_source=chatgpt.com "Requiring 2FA for package publishing and settings ..."
[6]: https://docs.npmjs.com/trusted-publishers/ "Trusted publishing for npm packages | npm Docs"
[7]: https://docs.github.com/actions/publishing-packages/publishing-nodejs-packages "Publishing Node.js packages - GitHub Docs"
[8]: https://docs.github.com/en/packages/learn-github-packages/introduction-to-github-packages "Introduction to GitHub Packages - GitHub Docs"

---

describe how release process will go from maintainer point of view (let's say I'd like to make a minor version increment for kaiten-cli package only). what actions should I perform, where new version should be specified etc. assume starting conditions - feature branch pushed to github

---

Assuming the setup is:

* PRs merge into protected `main`
* releases are managed with **Changesets**
* publishing is done by GitHub Actions with **npm trusted publishing**
* `@khaale/kaiten-cli` is a public package and the repo is a pnpm monorepo

then the maintainer flow for “release a **minor** bump of `@khaale/kaiten-cli` only” looks like this. Changesets is designed exactly for this: contributors declare release intent in a changeset file, then automation turns that into package version bumps, changelogs, and publishing. ([GitHub][1])

### What you do on the feature branch

You start from your already-pushed feature branch. On that branch, after the code is ready, you add a **changeset** instead of editing the version manually. In practice that means running `pnpm changeset` and choosing `@khaale/kaiten-cli`, then selecting **minor**. Changesets describes a changeset as the “intent to release” one or more packages with a semver bump type. ([GitHub][1])

A resulting file would look roughly like this:

```md
---
"@khaale/kaiten-cli": minor
---

Add support for X in ktc and improve Y output.
```

That file lives under `.changeset/` in the repo. The important part is that **this is where you specify the bump**. You do **not** set `0.2.0` yourself at this stage. Changesets later computes the next version and writes it into the package manifest for you. ([GitHub][1])

Then you commit that `.changeset/*.md` file along with your feature work and open or update the PR. Your normal CI runs on the PR and should validate install, lint, test, and pack. In your repo today, the root `check` script already runs workspace lint, test, and pack checks, and `@khaale/kaiten-cli` currently sits at version `0.1.0` with `publishConfig.access: "public"`. ([GitHub][2])

### What happens when you merge the feature PR

After the PR merges into `main`, the release workflow runs. The Changesets GitHub Action is built to do one of two things on the base branch: create or update a **release PR** with version bumps and changelog edits, and optionally publish when that release PR is merged. Its default release-PR behavior is exactly for this kind of workflow. ([GitHub][3])

So from your point of view, merging the feature PR does **not** immediately mean “npm publish now”. Instead, it usually means:

1. your feature lands on `main`
2. the release workflow notices the pending changeset
3. it opens or updates a release PR, usually something like **Version Packages**
4. that release PR contains the real generated version edits

For your example, if `@khaale/kaiten-cli` is currently `0.1.0`, and only that package has a `minor` changeset, the release PR would typically bump it to **`0.2.0`**. ([GitHub][4])

### Where the new version actually appears

The new version gets written by the release PR into:

* `packages/kaiten-cli/package.json`
* usually a package changelog such as `packages/kaiten-cli/CHANGELOG.md` if you enable changelogs
* the consumed changeset file is removed as part of versioning

That behavior is part of the Changesets workflow: update versions, edit changelogs, and read/delete changesets. In your repo, the root package is private, so the publish-relevant version is the one inside `packages/kaiten-cli/package.json`, not the root `package.json`. ([GitHub][3])

So the answer to “where should I specify the new version?” is:

* **before merge:** in `.changeset/*.md` as a `minor` bump
* **after automation runs:** the actual numeric version appears in `packages/kaiten-cli/package.json`

### What you do with the release PR

As maintainer, you review that release PR just like any other PR:

* confirm only the expected package was bumped
* confirm the generated changelog text is acceptable
* confirm CI passed on the release PR

If everything looks right, you merge the release PR. That merge is the “approve this release” step from a maintainer point of view. Changesets’ action is explicitly built around this release-PR checkpoint. ([GitHub][3])

### What happens at publish time

Once the release PR is merged, the publish workflow runs on `main`. Because the recommended setup uses **npm trusted publishing**, GitHub Actions authenticates to npm through OIDC for the publish operation, instead of using a long-lived npm token. npm documents this as the preferred model and requires `id-token: write` in the workflow; trusted publishing currently supports GitHub-hosted runners. ([npm Docs][5])

For you as maintainer, that means there is no “enter OTP code” step during CI publish. That is the big benefit relative to classic npm token flows with 2FA friction. npm says trusted publishing is intended to eliminate long-lived tokens, and OIDC auth is used automatically during `npm publish`. ([npm Docs][5])

### One-time setup you must do before this works

For this to work cleanly, you need to configure npm trusted publishing for **each public package** on npm. npm’s docs say each package can have one trusted publisher configured, and for GitHub Actions you set the GitHub owner/org, repository, and workflow filename such as `publish.yml`. ([npm Docs][5])

In your repo that means configuring trusted publishing on npm for at least:

* `@khaale/kaiten-cli`
* `@khaale/gitlab-cli`

Also, npm’s trusted-publisher docs require the package metadata to line up with the GitHub repo, and your current package manifests for `@khaale/kaiten-cli` and `@khaale/gitlab-cli` do not presently show a `repository` field, so I would add that before enabling publish automation. ([npm Docs][5])

### The maintainer flow in one sequence

From your point of view, starting with a pushed feature branch, it becomes:

1. make code changes on the branch
2. run `pnpm changeset`
3. select `@khaale/kaiten-cli`
4. choose `minor`
5. write a short release summary
6. commit the changeset file
7. open/update PR
8. merge PR after CI passes
9. wait for GitHub to open/update the release PR
10. review the generated bump to `packages/kaiten-cli/package.json`
11. merge the release PR
12. GitHub publishes `@khaale/kaiten-cli@0.2.0` to npm through trusted publishing

That is the cleanest maintainer UX because the release intent is captured on the feature branch, while the actual version number is generated centrally on the release PR. ([GitHub][1])

### If you want a simpler flow

There is a simpler variant where you skip the extra release PR and publish directly on merge to `main`. In that model, you would either manually edit `packages/kaiten-cli/package.json` or run `changeset version` directly in CI and publish right away. It is simpler, but I would not recommend it for your repo because you lose the clean maintainer approval point between “feature merged” and “package published.” Changesets’ release-PR flow is safer for a multi-package repo. ([GitHub][3])

If you want, I can turn this into a concrete `.changeset` + `.github/workflows/release.yml` + `publish.yml` setup for your repo.

[1]: https://github.com/changesets/changesets "GitHub - changesets/changesets:        A way to manage your versioning and changelogs with a focus on monorepos · GitHub"
[2]: https://raw.githubusercontent.com/khaale/agentic-cli-tools/main/package.json "raw.githubusercontent.com"
[3]: https://github.com/changesets/action "GitHub - changesets/action · GitHub"
[4]: https://raw.githubusercontent.com/khaale/agentic-cli-tools/main/packages/kaiten-cli/package.json "raw.githubusercontent.com"
[5]: https://docs.npmjs.com/trusted-publishers/ "Trusted publishing for npm packages | npm Docs"

