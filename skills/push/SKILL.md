---
type: skill
name: push
title: Release and Push Skill
description: "Use this skill when the user runs /push or asks to push, release, or publish @gregiteen/ssss-cli. /push always means a full release: bump, verify, commit, push, tag, publish to npm, and confirm. MANDATORY: You MUST read the full SKILL.md file before executing."
timestamp: 2026-09-25T00:00:00Z
---

# push

This repo ships one thing: the npm package `@gregiteen/ssss-cli`. There is no
server, no droplet, and no `production` branch. A release is **a version tag on
GitHub plus the same version on npm**, and downstream hosts install from either
one. Pushing `main` on its own releases nothing.

## What /push means

`/push` is always a **full release**. Never stop at `git push origin main`, and
never skip the tag or the npm publish because the change "is only docs". If
there is something to push, there is something to release.

Choose the version before you start:

| Change since the last tag | Bump |
|---|---|
| Docs, changelog, fixes, additive API | patch (`0.9.4` → `0.9.5`) |
| New spec section, new primitive, new contract | minor (`0.9.x` → `0.10.0`) |
| Anything that breaks a conformant host | minor until 1.0, and call it out in the changelog |

If the working tree is clean and `main` has no commits since the last tag,
there is nothing to release. Say so and stop.

## Steps

Run them in order. Stop at the first failure and report it. Don't skip ahead.

1. **Start from origin.** `git fetch origin && git status -sb` must show
   `main...origin/main` with nothing behind. If it's behind, pull (`--ff-only`)
   first.
2. **Write the changelog.** Put this release's entries under `## [Unreleased]`
   in `CHANGELOG.md`. List behavior a host can observe under a heading such as
   "Behavior changes hosts should check".
3. **Bump and restamp.**
   ```bash
   ./scripts/release.sh <version>             # VERSION, package.json, lockfile, CHANGELOG section
   node scripts/build-reference-bundle.mjs    # restamps the exporter version
   node scripts/generate-sbom.mjs             # writes artifacts/sbom-<version>.spdx.json
   ```
4. **Preflight.** `node skills/push/scripts/preflight-release.mjs` must print
   `ok` for every check. It runs skill validation, the parity audit, the full
   conformance suite, and `git diff --check`.
5. **Commit only what you mean to ship.** Stage files by name. Never use
   `git add .`. Check `git status --short` first: nothing unexplained may be
   left behind or swept in.
   ```bash
   git add CHANGELOG.md VERSION package.json package-lock.json \
     conformance/reference-bundle.ucw.json artifacts/sbom-<version>.spdx.json <your changed files>
   git commit -m "Release <version>: <one-line summary>"
   ```
6. **Push `main`, then the tag.** The tag must point at the commit you just
   pushed.
   ```bash
   git push origin main
   git tag v<version> && git push origin v<version>
   ```
7. **Publish from a clean clone of the tag.** Never publish from a working
   checkout or a git worktree: 0.8.0 and 0.9.0 were published from uncommitted
   trees, and a worktree records no `gitHead`.
   ```bash
   D="$TMPDIR/ssss-release"; rm -rf "$D"
   git clone --depth 1 --branch v<version> https://github.com/gregiteen/ssss.git "$D"
   (cd "$D" && npm publish --access public)
   rm -rf "$D"
   ```
   If publish fails with 401/403/404, run `npm whoami`. If it isn't
   `gregiteen`, stop and tell the user to log in. Do not type credentials or OTPs.
8. **Confirm.** npm can take a few minutes to show a new version, and
   `npm view` returns 404 until it does. That is expected, not a failure.
   ```bash
   node skills/push/scripts/verify-publish.mjs <version>
   ```
   It waits for the version to appear, then checks that its `gitHead` equals the
   `v<version>` tag commit and that `latest` points at it.

## Report

End with one line per step: the version, the commit, the tag, and the npm result
(`gitHead` matched, `latest` = version). If a step failed, give the exact command
and its output, and say what was and wasn't released.

## Notes

- This skill is linked for Claude Code at `.claude/skills/push`, and for Codex
  at `.agents/skills/push`. Both links point here. Edit this file only.
- The rule "boot `src/server/index.mjs` before publishing" belongs to other
  repos. This one has no server. Its gate is step 4.
