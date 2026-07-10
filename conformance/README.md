# SSSS Conformance

This directory holds the **canonical conformance contract** for SSSS. It is the
shared test suite every implementation MUST pass to claim conformance (spec §12).

> A host MUST NOT claim SSSS conformance without passing the current fixture set.

## Files

| File | Purpose |
|------|---------|
| [`fixtures.json`](fixtures.json) | Canonical request/response fixtures for the Operation Contract (spec §6). |
| [`reference-bundle.ucw.json`](reference-bundle.ucw.json) | The canonical `.ucw` reference bundle (spec §16, "Festival in a Box"). A `sale`-profile export, content-hashed; round-tripped by the runner. Rebuild with `node scripts/build-reference-bundle.mjs`. |
| `../registry/core.json` | The 15 core document primitives + 5 contract primitives, plus `runtime` (§11.8), `semantic` (§11.9), `bundle` (§16), and `provisioning` (§17) contracts. |

## Implementations under test

| Implementation | SSSS surface | Core primitives | Extensions |
|----------------|--------------|-----------------|------------|
| **festech.live** | `SsssOperationService` + `SsssLeaseService`, Postgres event log, ~4,024 vault files | integration audit required for core v0.7 | 118 app primitives |
| **ultrachat** | SQL `ssss_core_contract` + hardening migrations, `SsssApiClient`, ~1,110 vault files | (audit pending) | app primitives |
| **total-recall** | Markdown-native kernel, `validate-schema.mjs`, memory vault | memory-centric subset | memory categories |

## How to run

```bash
npx ssss conformance              # structural + registry portability validation
npx ssss conformance --engine     # also replay all fixtures + round-trip the reference bundle in-process
npx ssss conformance --endpoint <url> --token <pat>   # run fixtures against a live host
```

The runner validates that the fixture file is well-formed and that every
`expected_response` is internally consistent with the envelope rules. With
`--engine`, it replays every fixture through the reference engine (`src/engine.mjs`),
checks workflow runtime planning (`src/runtime.mjs`, spec §11.8), extension-registry
collision/schema/symlink safety and multilingual semantic retrieval/rendering (`src/semantic.mjs`,
§11.9), runs regression coverage for patch serialization and leases (§6/§7), and
round-trips the
reference bundle (validate → provision → import → re-import, spec §16/§17)
against a temp vault — proving idempotency, strict bundle shape validation, and
that no `tenant_private` or seller-bound `resource_bound` value ever lands. With
`--endpoint`, it POSTs each fixture's `request` to a host's Operation Contract
endpoint and diffs the response.

## Core vs. extension registry

The standard owns only the **core**: the 15 document primitives and 5 contract
primitives in [`../registry/core.json`](../registry/core.json), plus the `runtime`
(§11.8), `semantic` (§11.9), `bundle` (§16), and `provisioning` contracts. Every conformant
implementation maps to the same core.

Applications **extend** the core with their own primitives (festech has 118 —
`meeting`, `phone_number`, `inventory_item`, `language_convention`, …). Extensions:

- MUST NOT redefine or shadow a core type.
- MUST NOT redefine a type from a sibling extension.
- MUST be regular, non-symlinked JSON files with valid regex patterns and field lists.
- Live in the application's own extension registry, not here.
- SHOULD follow the same schema shape as core entries (`required_fields`,
  `append_only`, enums, patterns, immutable fields, references) so the same validator handles them.

## ⚠️ Open reconciliation items (spec ⇄ implementation drift)

These are real divergences found between the canonical spec and shipped
implementations. Each needs a decision (amend the spec via §15, or fix the impl)
before v1.0.

| # | Item | Spec says | festech impl does | Proposed resolution |
|---|------|-----------|-------------------|---------------------|
| 1 | **`delete` envelope** | §6.2 defines only `operation`, `patch`, `event`. | Implements a 4th envelope type `delete` (remove a VFS file). | ✅ **Resolved (v0.3).** §6.2 now defines `delete` as the canonical 4th envelope; the reference engine and fixture-009 cover it. |
| 2 | **Error codes** | §6.5 lists `401, 403, 409, 422, 500`. | Also returns `400` (invalid request / path traversal) and `404` (patch/delete target missing). | ✅ **Resolved.** §6.5 now lists `400` and `404` alongside the original five; `conformance/fixtures.json`'s `error_codes` block already documented all seven. |
| 3 | **Registry source of truth** | §5 defines primitives in prose. | festech keeps a 131-entry `primitive-registry.json`; ultrachat encodes the contract in SQL migrations. | ✅ **Resolved.** Canonical machine-readable core now lives in `registry/core.json` + `registry/extensions/*`; the reference engine validates against it (registry-driven, no per-type code). Apps re-derive in Track F. |
| 4 | **`language_convention` primitive** | Not in §5. §11.1 forbids translating control keys. | festech registers a `language_convention` primitive (multilingual authoring). | ✅ **Resolved (v0.4).** Documented in §11.7 as a `structural` presentation-overlay primitive (extension-owned). It never translates control keys — semantic-at-presentation, deterministic-at-validation. |

The point of this directory: drift like the above is invisible when each app keeps
its own copy of "the standard." Centralizing the fixtures + core registry here, and
having all three implementations run against them, is what turns "SSSS is a
standard" from a claim into a fact.
