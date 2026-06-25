# `ssss export`

Package a vault directory into a `.ucw` bundle (spec §16). Pure and deterministic:
the same vault + profile yields a byte-identical bundle (the timestamp is frozen and
the files are content-hashed), so exports are diffable and cacheable.

```bash
ssss export <vault-dir> [--profile backup|template|sale] [--out file.ucw.json]
```

Walks every `*.md` under the vault (skipping dotfiles and the `.events` log), reads
each file's `type` from frontmatter, resolves its portability class (§5.5), and keeps
only the classes the profile permits. The dropped files are reported with
`--show-dropped`.

Common flags: `--name`, `--description`, `--bundle-version`, `--exporter`,
`--ext <name>` (declare a required extension, repeatable), `--registry <dir>`.

Run `ssss export --help` for the full flag list.
See also: `ssss help portability`, `ssss help bundle`.
