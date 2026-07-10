---
type: skill
title: SSSS System Manager
name: ssss
description: "Inspect, validate, implement, or change SSSS primitives, registries, kernel commands, VFS/security adapters, events, projections, multilingual semantic runtime, generative UI, bundles, and host adapters. MANDATORY: Read this file before editing SSSS files or code."
timestamp: 2026-07-10T00:00:00Z
---

# SSSS — Structured Semantic Syntax System Manager

SSSS is a vendor-neutral, Markdown-first state and mutation contract. Canonical
state is typed Markdown plus append-only events. Databases, indexes, queues,
dashboards, and search stores are host projections unless explicitly documented
as external resources.

## Establish Ground Truth First

Do not infer the contract from an installed skill snapshot.

1. Find the repository root and inspect `package.json`, `VERSION`,
   `registry/core.json`, and `docs/ssss-spec.md` when they exist.
2. Treat `registry/core.json` as the machine-readable primitive contract and
   `docs/ssss-spec.md` as the normative explanation.
3. Treat `src/engine.mjs`, `src/runtime.mjs`, `src/semantic.mjs`,
   `src/bundle.mjs`, `src/registry.mjs`, and `src/frontmatter.mjs` as the
   reference behavior.
4. Treat host schemas and services as adapters or extension registries. Never
   promote host-only fields into the core standard without an explicit spec and
   registry change.
5. Read the current package name and version instead of hard-coding an alias.
   In this checkout the published package is `@gregiteen/ssss-cli`; the CLI is
   `ssss`.

If those files are absent, inspect the installed
`@gregiteen/ssss-cli/registry/core.json` export. Use the bundled reference only
as a fallback and report that the result is snapshot-based.

## Authority Order

When sources disagree, resolve drift in this order:

1. Conformance fixtures and tests for observed executable behavior.
2. `registry/core.json` for required fields, enums, append behavior, and
   portability.
3. `docs/ssss-spec.md` for normative semantics.
4. Reference engine/runtime/bundle code.
5. Host extension registry and host adapter documentation.
6. Skills, examples, README prose, and copied mirrors.

Do not silently pick one side. Identify the mismatch, decide whether code or
canon is wrong, update every affected source, and add a regression check.

## Document Contract

Every SSSS document has YAML frontmatter and a Markdown body. SSSS-managed
documents require the universal fields:

- `type`
- `title`
- `description`
- `timestamp`

Primitive-specific required fields are additive. An SSSS-managed skill also
requires `name`; a schema-v2 memory has knowledge-graph fields; a workflow
requires `name`.

Unknown frontmatter fields must be preserved for forward compatibility. Never
drop a nested map, array, or unknown field during parse/serialize or patch.

Registry declarations are executable contract. Enforce `required_fields`,
`required_when`, `enums`, `patterns`, `immutable_fields`, `references`,
`append_only`, and `portability`. Reject malformed extension definitions,
symlinked registry files, and core or sibling type collisions during load.

## Mutation Contract

Agent-generated mutations flow through the Operation Contract:

```text
validate envelope
  -> verify safe workspace/idempotency/actor identifiers
  -> resolve and contain the target path
  -> replay or reject the idempotency key + request hash
  -> authorize with verified actor identity (fail closed)
  -> validate any active lease (fail closed)
  -> validate universal + primitive-specific content
  -> commit atomically
  -> append the audit event
```

The mutation envelopes are:

- `operation` — create or fully replace a replace-type document.
- `patch` — merge an existing replace-type document without changing `type`.
- `event` — append an immutable event record.
- `delete` — remove a replace-type document and emit an audit event; reject
  append-type targets.

Use `dry_run: true` for model-generated preflight. Idempotency is scoped by the
effective request, not the key alone: the same request replays, while the same
workspace/key with a different request hash is a conflict.

## Append, Lease, and Path Safety

- `conversation` and `run` are append-only. Preserve prior bytes and append new
  records; never rewrite or delete them.
- Events are immutable.
- Paths must be relative, contained vault paths. Reject absolute paths,
  backslashes, null bytes, empty segments, `.`/`..`, directory targets, and
  symlink escapes.
- Leases are actor-owned, operation-linked, expiring locks. Missing, mismatched,
  malformed, or unreadable lease state fails closed.
- Hosts must overwrite caller-supplied actor data with verified session identity
  before authorization.

## Workflow Runtime

Workflow frontmatter owns the schedule. Cron, daemon, webhook, file watcher, and
event-loop processes are wake-up mechanisms, not a second scheduling database.

Use `@gregiteen/ssss-cli/runtime` to deterministically derive the trigger event,
task, and run envelopes. Duplicate ticks must replay idempotently. Queues and
task dashboards are disposable projections over workflow state and events.

## Bundles and Portability

Every document primitive resolves to one portability class:

- `structural` — reusable model shipped in templates and sale bundles.
- `tenant_private` — operator/customer runtime data; excluded from template and
  sale exports.
- `resource_bound` — exported only as a requirement declaration; never leak the
  seller's bound resource value.

Bundle paths must be unique, safe, and symlink-free. Validate content hashes,
required extensions, primitive inventory, core version, parameters, and link
integrity before import. Preflight the complete plan before the first commit so a
late invalid envelope cannot leave a partial install. Provisioning produces
deterministic Operation Contract envelopes; re-import must be a no-op.

## Multilingual Semantic Runtime

Treat semantic indexes and rendered text/UI as disposable projections. Canonical
documents are authored once in any language; do not create translation documents or
localized canonical trees.

- Index only `structural` documents by default. Include `tenant_private` and
  `resource_bound` sources only after an explicit authorized opt-in.
- Derive stable identity from `semantic_id`, then `resource`, then source path.
- Build edges from explicit `relations`, wiki links, and Markdown links.
- Record embedding model identity and vector dimensions and report lexical and
  semantic evidence separately.
- Render language at runtime through an injected adapter. Preserve primitive IDs,
  field IDs, enum codes, actions, permissions, paths, versions, hashes, and relations.

## Scope and Host Adapters

The core standard does not collapse host ownership layers. A host may implement
global/project or system/account/workspace overlays, but must document precedence
and preserve isolation. Shared system skills should be inherited through an
overlay rather than copied into every workspace.

When working in Total Recall, use its validated-write and memory-validator
adapter if those modules exist. In another host, locate its extension registry
and conformance bridge. Do not quote Total Recall paths as universal SSSS
architecture.

## Procedure for Changes

1. Classify the change: core primitive, contract behavior, runtime behavior,
   semantic/runtime-rendering behavior, bundle/provisioning behavior, projection, or
   host extension.
2. Inspect the registry, spec section, implementation, fixtures, and host bridge
   for that surface.
3. Make the smallest coherent change across code and canon.
4. Add positive, negative, replay, and invalid-path cases where applicable.
5. Run focused validation, then the full conformance gate.
6. Update skill/reference mirrors only after the executable contract is green.

## Validation

Validate a Markdown document with the dependency-free skill helper:

```bash
node skills/ssss/scripts/validate-schema.mjs path/to/document.md
```

In the SSSS reference repository, the required gate is:

```bash
npm test
```

It covers registry/engine parity, shipped-skill conformance, Operation Contract
fixtures, workflow runtime behavior, lease/frontmatter regressions,
extension-registry hardening, multilingual semantic behavior,
bundle/provisioning round trips, and CLI smoke tests.

For host adapters, run the host's named SSSS conformance command as well. Do not
substitute a loose YAML parse or a generic typecheck for the SSSS gate.

## Do Not

- Do not treat an installed skill, copied spec, or README as newer than the live
  registry and conformance suite.
- Do not use raw file writes for agent-generated vault mutations.
- Do not make a derived database/index/queue the canonical record.
- Do not add a primitive in prose without registry and fixture coverage.
- Do not translate symbolic control fields or index private content by default.
- Do not materialize a projection inside its source vault.
- Do not mix document primitives with contract envelopes.
- Do not claim conformance from HTTP success or file creation alone.
- Do not publish package names, versions, or exporter identities without reading
  them from current package metadata.

## References

Read `references/contract-reference.md` for the compact topology, primitive
families, package entry points, and drift checklist. For normative detail, read
the exact linked section of `docs/ssss-spec.md` rather than loading a stale
vendored copy.
