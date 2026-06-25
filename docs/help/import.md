# `ssss import`

Replay a bundle (or a pre-built plan) into a target vault through the reference
engine (spec §17.1, §6). Idempotent: each envelope carries a deterministic
idempotency key, so importing the same bundle twice commits nothing the second time.

```bash
ssss import <bundle.ucw.json> --vault <dir> [--param key=value]
ssss import --plan plan.json   --vault <dir>     # replay a plan from `ssss provision`
```

- `--vault <dir>` is required and is created if missing.
- Without `--plan`, import provisions inline first (resolving `--param` flags); a
  failed provision (unresolved params / dangling links) aborts before any write.
- `--dry-run` validates every envelope without committing.
- The summary reports `committed`, `unchanged (idempotent)`, and `failed` counts.

Run `ssss import --help` for the full flag list.
See also: `ssss help provisioning`, `ssss provision`.
