---
type: project_document
title: IMPROVEMENTS — Architecture
tags: ["project-management", "IMPROVEMENTS"]
timestamp: 2026-07-08T22:12:44Z
---

# IMPROVEMENTS — Architecture

> **Project Prefix**: `IMPROVEMENTS`
> **Kanban State**: ✅ Completed
> **Author**: Codex
> **Date**: 2026-07-08

---

## Design

This project is an audit-to-hardening project. It should not introduce a new
runtime architecture. It should tighten the existing one so repo-owned checks
catch the bugs currently visible by manual inspection.

## System Surfaces

| Surface | Current role | Improvement target |
| --- | --- | --- |
| `scripts/conformance.mjs` | Canonical test runner for fixtures, bundle round-trip, runtime, registry, and skills. | Keep as the single release gate. Add missing lease and bundle-shape checks here. |
| `scripts/validate-skills.mjs` | Enforces shipped skill frontmatter plus required package folders. | Keep strict. Fix `skills/push` instead of weakening the validator. |
| `src/bundle.mjs` | Implements export, validate, provision, and import for `.ucw` bundles. | Add `resource_bound` requirement reduction, `required_extensions` enforcement, `files` shape checks, and dry-run accounting. |
| `src/engine.mjs` | Implements the Operation Contract pipeline, RBAC, leases, idempotency, and commit/audit. | Add targeted regression coverage around leases and nested-map patch behavior. Avoid broad rewrites. |
| `src/frontmatter.mjs` | Dependency-free parser/serializer for SSSS Markdown frontmatter. | Preserve nested maps or reject unsupported writes visibly. No silent skip on successful mutation. |
| `scripts/cmd-new.mjs` | Generates starter projects and their conformance test. | Emit a registry-valid starter vault and add a smoke test that prevents enum drift. |
| `scripts/build-reference-bundle.mjs` | Builds the canonical reference `.ucw` bundle. | Use only valid source files, even for files that sale export later drops. |
| `docs/help/*` | Offline CLI help. | Add `leases.md`; update stale wording where specs moved from v0.4 to v0.6. |
| `docs/projects/*` | Kanban project truth. | Cross-link duplicate/deferred items and keep ownership boundaries clear. |

## Priority Architecture

### P0.1 Restore skill conformance

Do not relax `validate-skills.mjs`. The validator encodes a real repo decision:
published skills under `skills/` need `scripts/`, `references/`, `evals/`, and
`subagents/` with real content. `skills/push` should either become a complete
skill package or move out of the published `skills/` surface. Preferred path:
complete the package because release and push behavior is a real repo workflow.

Acceptance path:

- Add at least one useful script, reference, evals JSON with three assertions,
  and subagent prompt under `skills/push/`.
- Re-run `node scripts/validate-skills.mjs`.
- Re-run `npm test` and confirm it advances past skill validation.

### P0.2 Enforce resource-bound redaction

`PROFILE_INCLUDES.sale` and `PROFILE_INCLUDES.template` currently include
`resource_bound`, and `exportBundle()` keeps the original file content. That
contradicts the spec and registry text. The bundle pipeline needs an explicit
resource-bound reducer.

Suggested design:

- Resolve the primitive with `loadRegistries()`.
- If profile is `backup`, keep the full file.
- If profile is `template` or `sale` and effective portability is
  `resource_bound`, build a requirement declaration instead of copying content.
- Use extension registry `resource.binds` to remove or replace bound-value fields
  such as `domain_name`, `registrar`, `phone_number`, `provider`, credentials, or
  verified resource identifiers.
- Preserve non-sensitive metadata required to validate the primitive.
- Emit or require matching `parameters[]` and `provisioning[]` entries, or fail
  the export with a repairable error if the resource cannot be declared safely.
- Add a conformance fixture with a real-looking bound value and assert that the
  sale bundle does not contain that value.

### P1.1 Fix starter and reference vault validity

The current starter task and reference bundle source use `status: open`, while
the task enum allows only `pending`, `in_progress`, `done`, and `failed`.
Changing both to `pending` is low risk and should be backed by a smoke test that
validates all starter vault files against the registry, not only the sale export.

### P1.2 Stop nested-map data loss

`serializeDocument()` currently skips object values. That was acceptable only
while the engine used nested maps as presence placeholders. Now that `patch`
operations can merge frontmatter and serialize it back, success with silent loss
is unacceptable.

Preferred implementation:

- Add a small nested-map serializer for plain objects and arrays of scalars.
- If a value is not representable by the dependency-free YAML subset, reject the
  patch with a validation error and repair entry.
- Add a fixture where an existing nested map survives a harmless patch.
- Add a fixture where a nested map patch either round-trips or fails visibly.

### P1.3 Add lease conformance and help

Keep lease logic in `src/engine.mjs`; do not invent a second lock manager. Add
an engine-level conformance section that creates a temporary `leaseStore` and
proves:

- a leased path rejects writes without `lease_id`;
- a mismatched `lease_id` is rejected;
- an expired lease is reclaimed and the write proceeds;
- unreadable lease JSON fails closed.

Add `docs/help/leases.md` and ensure `ssss help leases` discovers it.

### P1.4 Tighten bundle validation and import reporting

`validateBundle()` should reject unknown required extensions by comparing
`manifest.required_extensions[]` to loaded extension registry IDs. It should also
require `files` to be an array, even when `file_count` is zero.

`importBundle()` or `cmd-import.mjs` should count dry-run successes separately
from committed writes. `--dry-run` should report "would commit" and leave the
target empty.

### P2.1 Documentation and tracker synchronization

After code fixes land, update:

- `skills/ssss-project-management/SKILL.md` reference from spec v0.4 to the
  current spec v0.6/package v0.7 reality.
- Existing project trackers so deferred items now owned by `IMPROVEMENTS` are
  cross-linked instead of duplicated.
- `README.md`, `docs/help/*`, and `conformance/README.md` only where the code
  behavior actually changed.

## Tradeoffs

| Option | Decision | Reason |
| --- | --- | --- |
| Weaken `validate-skills.mjs` so `skills/push` passes. | Reject. | The validator protects a real published-skill contract. The package should conform. |
| Keep `resource_bound` files verbatim and rely on authors to use placeholders. | Reject. | The standard promises the exporter strips seller-bound values. Relying on author discipline is not a safety boundary. |
| Add a YAML dependency to solve nested maps. | Defer unless the small serializer becomes fragile. | The repo intentionally stays dependency-free. A narrow serializer or visible rejection is enough for this bug. |
| Put all remaining work in `SSSS_FRONTIER_IMPROVEMENTS`. | Reject for this request. | The user explicitly asked for a new `IMPROVEMENTS` project. Cross-link old open items instead of hiding this audit in an older tracker. |
| Fix downstream product rollout here. | Reject. | Cross-repo rollout belongs to the existing V1 business bundle Track F unless reassigned. |
