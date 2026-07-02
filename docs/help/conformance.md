# Conformance (spec §12)

A host MUST NOT claim SSSS conformance without passing the canonical suite in
`conformance/`. It is the shared test every implementation runs.

```bash
ssss conformance                 # structural + registry portability validation
ssss conformance --engine        # also replay every fixture + round-trip the reference bundle in-process
ssss conformance --endpoint <url> --token <pat>   # run the fixtures against a live host
```

## What `--engine` proves

1. **All Operation Contract fixtures** (`conformance/fixtures.json`) replay through
   the reference engine (`src/engine.mjs`) and produce the expected responses —
   create/patch/event/delete, dry-run, idempotency, and failure cases.
2. **The reference bundle round-trips**: `validate → provision → import → re-import`
   on `conformance/reference-bundle.ucw.json`, asserting
   - the bundle's schema + content hash are valid,
   - the `sale` profile carries no `tenant_private` file,
   - provision resolves parameters and link integrity,
   - import commits every file, and a second import commits **zero** (idempotent),
   - no `tenant_private` file ever lands on disk.
3. **Workflow runtime checks** (`src/runtime.mjs`) prove a workflow trigger plans
   deterministic event/task envelopes, duplicate daemon ticks replay idempotently,
   and worker-created runs commit through the Operation Contract.

## Endpoint mode

`--endpoint` POSTs each fixture's `request` to a host's Operation Contract endpoint
and diffs the response — this is how festech / ultrachat / total-recall prove they
implement the *same* standard rather than three drifting copies.

See also: `conformance/README.md`, `ssss help runtime`, `ssss help provisioning`.
