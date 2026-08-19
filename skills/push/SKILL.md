---
type: skill
name: push
title: Release and Push Skill
description: "Use this skill when the user asks to push changes to GitHub, publish to npm, or create a release for the SSSS repository. MANDATORY: You MUST read the full SKILL.md file before executing."
timestamp: 2026-07-02T00:00:00Z
---

# push

## Deploy model — read before pushing

> [!CAUTION]
> **Deployment is triggered by pushing the `production` branch.** A cron
> watcher on the droplet (`/root/auto-deploy.sh`) picks it up within ~60s.
> GitHub Actions is **not** the deploy mechanism anywhere in this workflow —
> if a repo has workflow files they belong to an upstream project's own CI
> (lint, CodeQL, release), not to our deploy path. Never reason about deploy
> risk from the presence or absence of `.github/workflows`.

| action | deploys? |
|:---|:---|
| `git push origin production` | **YES** — droplet watcher builds and swaps |
| `git push origin HEAD:production` (from a feature branch) | **YES** |
| `git push origin main` / `master` / any other branch | no — backup only |

**After every production push, sync main so it mirrors production:**

```bash
git push origin production:main
git fetch origin main && git branch -f main origin/main
```

**If a repo has no `production` branch it has no deploy path.** Pushing its
default branch is a backup, not a release. Confirm before assuming:

```bash
git branch -r | grep -w production || echo "no production branch — push is backup only"
```

Use this skill when you need to push a new version of the `@gregiteen/ssss-cli` package to GitHub and npm.

## Step 1: Update Version and Changelog

If the user wants to cut a new release and bump the version, you can use the built-in release script:
```bash
./scripts/release.sh <new-version>
```
This updates the `VERSION` file and stubs a new entry in `CHANGELOG.md`.

## Step 2: Commit and Push Changes

Ensure all modifications are staged and committed.
```bash
git add .
git commit -m "Release <version>"
git push origin main
```

## Step 3: Create and Push the Version Tag

**CRITICAL**: Do not forget to tag the commit and push the tag! Downstream dependencies like `festech.live` using `pnpm` rely on the tag to resolve the package via GitHub.

```bash
git tag v<version>
git push origin v<version>
```

## Step 4: Publish to NPM

Finally, if the package is ready to be published to the public npm registry, you should run:
```bash
npm publish --access public
```

If it fails due to 404, it might mean the `@ssss` organization is not set up on npm, or the user needs to authenticate. Let the user know if that happens.
