# Release Checklist

Use this checklist before pushing or publishing `@gregiteen/ssss-cli`.

- Run `node skills/push/scripts/preflight-release.mjs`.
- Confirm `VERSION`, `package.json`, and `CHANGELOG.md` agree when cutting a tagged release.
- Commit intentional changes only.
- Push the branch before pushing the `v<version>` tag.
- Publish with `npm publish --access public` only after the GitHub tag resolves,
  and only from a fresh clone of that tag (never a working tree or git worktree).
- Confirm `npm view @gregiteen/ssss-cli@<version> gitHead` equals the tag's commit.
