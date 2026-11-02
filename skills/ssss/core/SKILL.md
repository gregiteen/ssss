# SSSS portable core — 0.13.0

Verified against the SSSS owner package, registry and spec on 2026-11-02. Establish ground truth from the installed validator, composed registry plus lock, and actual host mutation path. Schema support does not prove a configured runner or provider integration.

All canonical state is Markdown/YAML in the VFS. Use the owning CLI/API and validated operation/patch/event/delete envelopes. Preserve universal and primitive fields, identity, unknown fields and timestamps. Validate before atomic commit; enforce actor authority, path containment, idempotency request hashes, leases and append-only constraints. No raw database or filesystem fallback for canonical mutations. Databases and queues are projections; never back them up as the source of truth.

Read only the relevant sections of the [normative spec](references/ssss-spec.md): document/frontmatter and registry contracts for schema work; operation contract and safety for mutations; workflow/trigger/task/run for automation; bundles and portability for import/export; adapter/kernel/UI for host integrations. The [core registry](references/core-registry.json) declares actual primitive required fields, constraints and portability; do not invent unsupported operations or blanket host-specific MemoryNode requirements.

## Workflow and trigger work
Workflow triggers and standalone trigger documents are distinct canonical primitives. A standalone trigger targets a workflow template with parameters; workflows may own inline trigger definitions. Inspect the current registry/spec for required fields and enums. Use the installed runtime adapter to derive deterministic trigger/task/run operations; duplicate ticks replay through idempotency. A cron/interval/webhook/watcher is a wake-up mechanism, not a second scheduling database. Record observed task/run outcomes separately from declaration, enabled state and scheduler handled slots. Explicitly report unsupported host trigger types and missing execution capability.

## Bundles and adapters
Preserve portability classes: structural definitions, tenant-private data and resource-bound requirements. Validate the complete import plan and references before commit, including forward references; missing references reject the import rather than weakening constraints. Check actual host authorization and adapter conformance; local fixtures do not prove provider execution. Use source-owned CLI help for flags and inspect structured validity, not process exit alone.

## Verification
Run relevant schema/registry/lock and operation conformance, with valid and invalid examples. Cover duplicate/conflicting idempotency (including retries answered from the event log), unsafe paths, unauthorized/expired actors, leases, append semantics, rollback and commit-intent crash recovery where changed. Use `ssss --help`, then operation-specific help; commands differ by installed version. Report exact package version, registry/lock identity and actual results. Keep secrets and private runtime data out of skill content, bundles and logs.

Normative sources are bundled below from the owner release tag v0.13.0 (`docs/ssss-spec.md` and `registry/core.json` at that tag). Retain authored local wrappers/references; this managed core is the portable update boundary.
