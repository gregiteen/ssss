# Security and UX impact — SSSS 0.9 semantic kernel

Date: 2026-07-10

## Security changes

- Registries fail closed on malformed schemas, invalid regexes, symlinks, namespace
  collisions, missing dependencies, and integrity-lock drift.
- Canonical mutations flow through one kernel with verified identity, capability
  policy floors, step-up, explicit human confirmation, leases, idempotency, VFS
  containment/CAS, immutable events, and projection dispatch.
- Semantic indexes and render inputs exclude `tenant_private` and `resource_bound`
  documents by default. Language selection cannot widen authorization scope.
- Runtime render adapters receive an invariant-control block and cannot alter
  primitive IDs, field IDs, enum codes, actions, permissions, paths, versions,
  hashes, or relations.
- Bundle and migration preflight occurs before commit, preventing partial installs.

## User-facing impact

- Users author canonical content and primitives once in any language. Multilingual
  embeddings and LLM rendering provide cross-language retrieval and presentation on
  demand; no translation documents or localized vault copies are required.
- `ssss semantic --include-private` remains an explicit high-trust opt-in.
- Generated UI is a validated projection over trusted components and actions. Invalid,
  inaccessible, over-complex, hidden-field, or unauthorized manifests fall back to a
  deterministic form/table/detail view.
- Every generated action becomes a capability-bound kernel command; UI code cannot
  mutate canonical or projection state directly.

## Host UI guidance

Hosts should expose language, excluded-private counts, embedding provenance,
projection hashes/drift, confirmation requirements, and actionable validation
errors. Private indexing and protected mutations require authenticated privileged
flows. Generated interfaces must preserve accessible labels and deterministic
fallbacks.

## Verification notes

Repository conformance covers invalid paths, symlinks, CAS/no-partial-write,
authorization, step-up, human confirmation, lease/idempotency store parity, event
replay, projection failure/drift, privacy defaults, multilingual retrieval, invariant
rendering, adversarial UI manifests, collisions, and two-phase bundle import.
