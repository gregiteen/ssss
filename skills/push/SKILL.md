---
type: skill
name: push
title: Release and Push Skill
description: "Use this skill when the user asks to push changes to GitHub, publish to npm, or create a release for the SSSS repository. MANDATORY: You MUST read the full SKILL.md file before executing."
timestamp: 2026-07-02T00:00:00Z
---

# push

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
