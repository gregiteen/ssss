---
type: project_document
title: SPEC_CODE_ALIGNMENT — Audit
tags: ["project-management", "SPEC_CODE_ALIGNMENT"]
timestamp: 2026-09-24T00:00:00Z
---

# SPEC_CODE_ALIGNMENT — Audit

> **Project Prefix**: `SPEC_CODE_ALIGNMENT`
> **Kanban State**: ✅ Completed
> **Author**: Claude (Opus 5.5) with Greg Iteen
> **Date**: 2026-09-24

---

An audit of `docs/ssss-spec.md` (v0.9, stable) against the 0.9.3 reference
implementation. The engine, registry and test suite are the ground truth. Every
finding below was reproduced against the code at `5a5ad46`.

The existing parity gates (`audit-registry-field-usage`, `audit-spec-refs`,
reconciliation table) all pass. They check registry and engine against each
other, but nothing checks the spec text against either one. That's why the
drift below went unnoticed.

## A. Correctness bugs in the reference implementation

| # | Finding | Evidence | Severity |
|---|---------|----------|----------|
| A1 | A failing `resourceCoordinator.finalize` rolls back the VFS commit after the canonical event has already been appended. The immutable log records a mutation that the vault no longer contains. | `src/kernel.mjs` commit block: `finalize` runs inside the same `try` as the commit, so its `catch` runs the rollback. The 0.9 architecture (§13) sets the order as "canonical intent commit → finalize → reconcile". | High |
| A2 | A `dry_run` calls `resourceCoordinator.prepare` and never calls `finalize` or `reconcile`, so the prepared resource leaks. Bundle import dry-runs every envelope as a preflight, so every provisioned file prepares twice. | `src/kernel.mjs` dry-run early return; `src/bundle.mjs` preflight pass | Medium |
| A3 | Kernel failures have no machine-readable code. The reference HTTP adapter guesses the status by searching the error text: it never returns 404, 401 or 400 (for a malformed envelope), and it maps lease and version conflicts to 422 instead of 409. | `src/http.mjs` status mapping | Medium |
| A4 | Some conformance fixtures' `expected_http_status` values contradict the spec's error table. 007 (malformed envelope) expects 422, not 400. 011 (missing principal) expects 422, not 401. 018 (missing capability) expects 422, not 403. The in-process runner never checks status codes. | `conformance/fixtures.json`; `scripts/conformance.mjs` `runAgainstEngine` | Medium |
| A5 | The resource coordinator hooks have no conformance coverage. | `grep prepare scripts/` finds no tests | Medium |

## B. The spec contradicts itself or the code

| # | Finding | Evidence |
|---|---------|----------|
| B1 | **None of the spec's 14 example documents pass the reference validator.** §4.2 makes `title`, `description` and `timestamp` universally REQUIRED, and the validator enforces that, but no §5.4 example includes all three. | Every `\`\`\`markdown` example run through `createValidator().validateDocument` |
| B2 | §6.1/§6.3 say authorization reads `envelope.actor.role`. The 0.9 kernel deletes `envelope.actor` and authorizes an injected **verified principal** against **capabilities** (`<qualified_type>:<action>`). `actor.role` only exists in the pre-0.9 `createEngine` compatibility wrapper. | `kernel.mjs` `delete envelope.actor`; `authorization.mjs` |
| B3 | The §6.3 stage order is wrong. The real order is: envelope, idempotency, read current, content validation, authorization, lease, resource prepare, dry-run exit, commit (with compare-and-swap), event append, finalize, projection dispatch, idempotency record. The spec's "5.5" stage and separate "audit" stage don't match this, because the canonical event *is* the audit record. | `kernel.mjs` `execute` |
| B4 | The §8.2 event record lists `ts` and `caused_by`. The canonical event uses `timestamp`, `causation_id`, `schema_version`, `principal`, `action`, `before_hash`/`after_hash`, `request_hash`, `changed_fields`, `operation_id`, `idempotency_key`, `primitive_id`/`primitive_version` and `resource_status`. | `events.mjs` `createCanonicalEvent` |
| B5 | The §6.4 response has `replay: {}`. The real response has `replay: true` and `event_id`. | `types/kernel.d.ts` `SsssResponse` |
| B6 | §6.4 is cited for idempotency (§6.1, §6.2, §11.8), but §6.4 is the response section. No section defines the idempotency key, the request hash, retention, or whether failed requests are remembered. | cross-refs |
| B7 | §13 says an idempotency key is "UUID v4, min 8 chars". §11.8 requires *deterministic* keys derived from trigger identity. The fixtures say "UUID v4 recommended". | §13 vs §11.8 |
| B8 | §5.3 omits `rule`, `security_role`, `page`, `migration` and `release` from the replace-type list. | registry `append_only: false` |
| B9 | §4.4 omits `ROLE.md` (`security_role`), which the registry declares. | registry `canonical_filename` |
| B10 | §4.2 recommends `locale`. The registry's `recommended_semantic` and the reserved keys say `language`, and the semantic projector reads both. | registry vs §4.2; `semantic.mjs:97` |
| B11 | Appendix A's reserved-key list leaves out `title`, `description`, `timestamp`, `x_portability`, `primitive_type` and `__body__`. | §4.2, §5.5, §6.2 |
| B12 | The spec never mentions 0.9 features the CHANGELOG ships: the kernel and adapter contracts (VFS, identity, lease, idempotency, event, projection, resource), qualified identities (`ssss:assistant`), registry composition (aliases, dependency ranges, policy floors, integrity locks), `immutable_fields`, `references`, `patterns`, `lease_required`, and `manifest.dependencies`. | CHANGELOG 0.9.0 vs spec |
| B13 | §9 says validation checks required fields only. The engine also enforces `required_when`, `enums`, `patterns`, `references`, `immutable_fields`, "type never changes", and `primitive` meta-schema checks. | `registry.mjs` `validateDataConstraints` |
| B14 | §7 has no lease protocol. A lease is bound to `principal_id` and `operation_id` as well as `lease_id`, and has acquire, renew and release semantics. | `leases.mjs` |
| B15 | §16.3 says "canonical serialization of `files`" without defining it, so a second implementation can't reproduce `content_hash`. | `bundle.mjs` `contentHash` / `canonicalFiles` |
| B16 | §16.2 examples are stale (`ssss_core_version: "0.3"`, exporter `@0.8.0`). `manifest.dependencies` is undocumented. Sale-profile reduction of `resource_bound` fields (value → `REQUIREMENT`) is undocumented. | `bundle.mjs` |
| B17 | §6.2 `delete`: "reject a non-existent path" and "an already-deleted path is an idempotent no-op" read as contradictory. The real rule: a replay under the *same key* returns the stored result; a new key against a missing path is `not_found`. | kernel |
| B18 | The §6.1 envelope leaves out `primitive_type` and `operation_id`, which the kernel accepts. It also marks `content` required for `event`, but the kernel accepts an event with no payload. | kernel, `kernel.d.ts` |
| B19 | Frontmatter is "YAML", but the dependency-free reference parses a documented subset. Without the subset in the spec, interoperability isn't defined. | `frontmatter.mjs` header |
| B20 | §17.4 has a garbled sentence ("from `v2` to a `v1`-conformant shape"). | §17.4 |
| B21 | Host-product leakage remains after `c208680`: "Total Recall reference kernel" (header), `npx total-recall compile` (§10.1), "festech ships it" (§11.7), `festech` examples (§16.2, §17.2). | grep |
| B22 | The model examples hardcode a vendor model string (`anthropic/claude-opus-4-5`). | §5.4 |
| B23 | §6.5 lists HTTP numbers only. The symbolic codes (`validation_failed`, `idempotency_conflict`, …) exist in `fixtures.json` but not in the spec. | fixtures `error_codes` |
| B24 | §12 doesn't mention the 0.9 adapter-conformance suite or the CLI smoke checks that `npm test` runs. | `conformance-09.mjs` |
| B25 | §2 doesn't define principal, capability, qualified type, adapter, envelope, bundle or portability class. | §2 |

## C. Verdict

The format is sound. The drift is in how the spec *describes the contract*:
it still describes the pre-0.9 role-based engine, and its own examples fail
validation. Fix the three kernel bugs, correct the fixtures, bring the spec in
line with the kernel, and add a gate so spec examples can't drift again.
