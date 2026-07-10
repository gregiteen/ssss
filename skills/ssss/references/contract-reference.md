# SSSS Contract Reference

This is an operational map. The normative source is the current
`docs/ssss-spec.md`; the machine-readable source is `registry/core.json`.

## Reference-kernel topology

| Surface | Responsibility |
| --- | --- |
| `registry/core.json` | Core document/contract primitives, universal fields, enums, portability, bundle/runtime vocabularies. |
| `registry/extensions/*.json` | Host/application types that cannot redefine core primitives. |
| `src/engine.mjs` | Operation Contract, validation, authorization, leases, idempotency, atomic commit, audit. |
| `src/runtime.mjs` | Workflow trigger planning and deterministic event/task/run envelopes. |
| `src/semantic.mjs` | Deterministic records/edges, multilingual embeddings, hybrid retrieval, and invariant rendering. |
| `src/bundle.mjs` | Export, validate, provision, import, portability filtering, link/hash integrity. |
| `src/registry.mjs` | Registry loading and type/portability resolution. |
| `src/frontmatter.mjs` | Dependency-free parse/serialize with unknown-field preservation. |
| `conformance/fixtures.json` | Canonical mutation examples and negative cases. |
| `scripts/conformance.mjs` | Full executable contract gate. |

## Package entry points

Read the npm package name from `package.json`. The current reference checkout
uses `@gregiteen/ssss-cli` and exposes `/engine`, `/runtime`, `/semantic`, `/bundle`,
`/registry`, `/frontmatter`, `/registry/core.json`,
`/conformance/fixtures.json`, and `/conformance/reference-bundle.ucw.json`.
The executable command is `ssss`.

## Document versus contract primitives

Document primitives persist as Markdown and carry universal frontmatter.
Contract primitives are mutation/concurrency envelopes and are not Markdown
document types.

Current core document families include knowledge (`memory`), capability
(`skill`, `page`), governance (`rule`, `security_role`), work (`task`,
`workflow`), actors/catalog (`assistant`, `model`), transcripts (`conversation`,
`run`), and lifecycle/meta (`conflict`, `migration`, `release`, `primitive`).

The contract primitives are `operation`, `patch`, `event`, `delete`, and
`lease`.

## Required validation dimensions

For a document:

1. Frontmatter exists and parses.
2. Universal fields are present and non-empty.
3. `type` exists in the core or a loaded extension registry.
4. Primitive-specific required/conditional fields are present.
5. Enum values are valid.
6. Pattern constraints match and document references resolve safely.
7. Immutable fields do not change during replacement or patch.
8. Append-only behavior is preserved.
9. Unknown fields survive parse/serialize and patch.
10. Path and canonical filename rules hold where applicable.

For an envelope:

1. Envelope type and identifiers are valid.
2. Target path is relative and contained.
3. Idempotency replay is bound to the request hash.
4. Actor identity is verified and authorization fails closed.
5. Lease state is valid or the write is rejected.
6. Content validates against universal plus primitive-specific rules.
7. Commit is atomic and emits an audit event.

For a bundle:

1. Manifest shape and core version are supported.
2. Required extensions are loaded.
3. Paths are safe, unique, and sorted.
4. Content hash and primitive inventory match.
5. Portability prevents tenant-private and resource-value leakage.
6. Parameters/provisioning use registry vocabularies.
7. Internal links resolve after remapping.
8. Re-import replays without new commits.

For a multilingual semantic projection:

1. Records and index hashes are deterministic for identical inputs.
2. Stable identity, tokens, content hashes, portability, and graph edges are retained.
3. Private and resource-bound documents are excluded unless explicitly authorized.
4. Embedding records retain model identity and vector dimensions.
5. Lexical and semantic evidence remain separately inspectable.
6. Runtime rendering preserves all symbolic control fields.
7. Language selection never widens authorization or portability scope.

## Drift checklist

Compare package/version metadata, spec and registry versions, registry fields
against engine consumption, `spec_ref` headings, docs/skills against package
exports, reference-bundle provenance, host extensions against core ownership,
and generated/symlinked skill copies against tracked sources. Add a deterministic
check for every drift class that has occurred once.
