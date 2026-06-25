# `ssss provision`

Plan a bundle install (spec §17): resolve parameters, check link integrity under
id-remap, and emit an ordered list of Operation Contract envelopes. Pure — it never
touches the filesystem, so it is safe to run and diff before importing.

```bash
ssss provision <bundle.ucw.json> --param key=value [--workspace id] [--prefix path] [--out plan.json]
```

- Required parameters that are neither supplied nor defaulted cause a non-zero exit.
- Any `[[link]]` that points outside the bundle is reported as a dangling link and
  fails the plan.
- `--prefix` relocates every file under a target path; link checks follow the remap.
- Each envelope gets a deterministic idempotency key, so the resulting plan is safe
  to import more than once.

Run `ssss provision --help` for the full flag list.
See also: `ssss help provisioning`, `ssss import`.
