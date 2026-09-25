# Release Checklist

The short form of `SKILL.md`. Every item is required on every `/push`.

- [ ] `main` matches `origin/main`, with nothing behind.
- [ ] Release notes are under `## [Unreleased]` in `CHANGELOG.md`.
- [ ] `./scripts/release.sh <version>`, then the reference bundle and SBOM are rebuilt.
- [ ] `node skills/push/scripts/preflight-release.mjs` prints `ok` for every check.
- [ ] Only intended files are staged, by name, never `git add .`.
- [ ] `main` is pushed, then `v<version>` is tagged on that commit and pushed.
- [ ] `npm publish --access public` is run from a fresh clone of the tag.
- [ ] `node skills/push/scripts/verify-publish.mjs <version>` confirms that `gitHead` matches the tag and `latest` is the new version.
