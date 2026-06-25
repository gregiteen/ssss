# `ssss autolink`

Generate OKF wiki-links across an SSSS vault. Rewrites bare references to
`[[slug]]` links so a vault is navigable as an "LLM-wiki," using bundle-relative
absolute paths. Deterministic and idempotent — running it twice changes nothing.

```bash
ssss autolink [dir]      # default dir: the current directory
```

The same rewrite engine backs provisioning's id-remap (§17.3): when `provision`
relocates files under a `--prefix`, link targets are recomputed the same way, so
internal links never dangle after a move.

See also: `ssss help provisioning`.
