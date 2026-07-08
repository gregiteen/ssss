---
type: project_document
title: IMPROVEMENTS — Product Requirements
tags: ["project-management", "IMPROVEMENTS"]
timestamp: 2026-07-08T22:12:43Z
---

# IMPROVEMENTS — Product Requirements

> **Project Prefix**: `IMPROVEMENTS`
> **Kanban State**: ✅ Completed
> **Author**: Codex
> **Date**: 2026-07-08

---

## Problem

The SSSS repo is the canonical package and reference implementation for the
Markdown-first state contract. Its current value depends on a simple promise:
`npm test`, the registry, the spec, the CLI, shipped skills, and generated starter
projects all agree about what is conformant.

The 2026-07-08 audit found that this promise is weakened in a few high-impact
places. The most urgent issue is visible immediately: `npm test` fails because
the newly shipped `skills/push` package does not satisfy the skill package
conformance contract. Other issues are more subtle but more dangerous: sale and
template exports keep `resource_bound` files verbatim instead of reducing them to
requirement declarations, starter scaffolds generate invalid task statuses, and
frontmatter patch serialization can silently drop nested maps.

This project exists to turn those findings into an ordered, testable improvement
program rather than letting them remain scattered across old trackers, comments,
and one-off observations.

## Scope

### In scope

- Restore the canonical conformance signal so `npm test` is green and meaningful.
- Fix packaging and portability bugs that could leak seller-bound resources or
  ship invalid starter vaults.
- Add regression coverage for the current gaps: skill package structure,
  `resource_bound` redaction, scaffold validity, dry-run accounting, bundle
  shape validation, leases, and nested frontmatter preservation.
- Synchronize stale docs and tracker references that still point at older spec
  versions or open items that have moved.
- Keep all work grounded in repo-owned files: `src/*`, `scripts/*`,
  `registry/*`, `conformance/*`, `docs/help/*`, `skills/*`, and
  `docs/projects/*`.

### Out of scope

- Cross-repo rollout into downstream products. That remains owned by
  `SSSS_V1_BUSINESS_BUNDLE` Track F unless explicitly moved.
- Formal certification against external standards. SSSS can preserve voluntary
  interoperability language without claiming a relationship that does not exist.
- New primitives unrelated to conformance, portability, runtime safety, or
  release readiness.

## Requirements

1. `npm test` must pass locally with the full `conformance --engine` path.
2. `node scripts/validate-skills.mjs` must pass for every shipped skill under
   `skills/`.
3. A `sale` or `template` export must never emit a seller-bound value from a
   `resource_bound` primitive. If a resource cannot be reduced deterministically,
   the export must fail with a repairable error.
4. `ssss new` must generate a starter vault whose files validate against the
   current registry, including task status enums.
5. `scripts/build-reference-bundle.mjs` must not rely on invalid dropped files to
   prove sale filtering.
6. `patch` operations must preserve nested frontmatter maps or fail visibly.
   They must not report success after silently losing data.
7. Lease behavior must have conformance coverage for conflict, mismatch, expiry,
   and unreadable state, plus an offline help topic.
8. Bundle validation must reject unknown `required_extensions` and malformed
   outer bundle shapes, including missing `files`.
9. CLI dry-run output must distinguish "would commit" from "committed" and leave
   the target vault empty.
10. Project and skill docs must reflect current repo reality: package `0.7.0`,
    spec `0.6`, conformance fixture version `1.4.0`, and the active project
    ownership boundaries.

## Prioritized Findings

| Rank | Severity | Finding | Evidence | Impact | Owner surface |
| --- | --- | --- | --- | --- | --- |
| 1 | P0 | Skill conformance is broken by `skills/push`. | `npm test` and `node scripts/validate-skills.mjs` fail because `skills/push/{scripts,references,evals,subagents}` are empty or missing real files. | Blocks the canonical green conformance signal and release confidence. | `skills/push`, `scripts/validate-skills.mjs` |
| 2 | P0 | `resource_bound` sale/template export can leak bound resource values. | `src/bundle.mjs` includes `resource_bound` files in `sale`; a probe exported `domain_name: secret.example` verbatim even though spec §5.5 says seller values must be stripped. | Data safety and marketplace trust risk. | `src/bundle.mjs`, `registry/core.json`, `registry/extensions/*`, `conformance/*` |
| 3 | P1 | Starter and reference vault tasks use invalid `status: open`. | `scripts/cmd-new.mjs` and `scripts/build-reference-bundle.mjs` emit `status: open`; the registry enum rejects it with `pending, in_progress, done, failed`. | New users can start from invalid SSSS files; reference data hides invalidity by dropping tenant-private tasks from sale export. | `scripts/cmd-new.mjs`, `scripts/build-reference-bundle.mjs`, `registry/core.json` |
| 4 | P1 | Nested frontmatter maps are silently dropped during serialization. | `src/frontmatter.mjs` skips object values in `serializeDocument`; the existing frontier tracker already flags this as a data-loss path. | A successful patch can erase structured metadata without warning. | `src/frontmatter.mjs`, `src/engine.mjs`, `conformance/fixtures.json` |
| 5 | P1 | Lease behavior exists but is under-specified in tests and help. | `src/engine.mjs` has `checkLease`; conformance metadata mentions lease conflicts, but no lease fixture or `docs/help/leases.md` exists. | Lock safety can regress without a failing test. | `src/engine.mjs`, `scripts/conformance.mjs`, `docs/help/leases.md` |
| 6 | P1 | `required_extensions` is not enforced. | `validateBundle()` returned valid for a bundle declaring `required_extensions: ["missing-extension"]` when the hash was correct. | Hosts may accept bundles that require unavailable extension semantics. | `src/bundle.mjs`, `registry/extensions/*` |
| 7 | P1 | `ssss import --dry-run` reports committed writes. | `node scripts/ssss.mjs import ... --dry-run` printed `14 committed`; `find` showed no files written. | Operators can misread dry-run output during provisioning. | `src/bundle.mjs`, `scripts/cmd-import.mjs` |
| 8 | P2 | Bundle shape validation accepts a missing `files` array when `file_count` is `0`. | `validateBundle()` returned valid for a bundle with no `files` property and a matching empty hash. | Bad bundles can pass as valid empty bundles. | `src/bundle.mjs`, conformance bundle checks |
| 9 | P2 | Version and tracker references are stale in repo docs. | `skills/ssss-project-management/SKILL.md` still says current draft `v0.4`; open items in `SSSS_FRONTIER_IMPROVEMENTS` overlap this project. | Agents can route work to stale assumptions and duplicate trackers. | `skills/ssss-project-management`, `docs/projects/*` |
| 10 | P3 | Release-readiness docs need one final ownership pass. | Existing project trackers include historical downstream notes and deferred tasks that should be cross-linked, not re-owned. | Lower urgency, but improves contributor clarity before v1.0. | `docs/projects/*`, `README.md`, `docs/help/*` |
