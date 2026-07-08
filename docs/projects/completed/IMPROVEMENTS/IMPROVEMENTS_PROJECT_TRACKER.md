---
type: project_document
title: IMPROVEMENTS — Project Tracker
tags: ["project-management", "IMPROVEMENTS"]
timestamp: 2026-07-08T22:12:44Z
---

# IMPROVEMENTS — Project Tracker

> **Project Prefix**: `IMPROVEMENTS`
> **Kanban State**: ✅ Completed
> **Author**: Codex
> **Date**: 2026-07-08

---

> Status legend: `[ ]` todo · `[x]` done. Keep this tracker as the source of
> execution truth for the `IMPROVEMENTS` project.

## Urgency Queue

1. P0: Restore `npm test` by fixing `skills/push` conformance.
2. P0: Prevent `resource_bound` value leakage in sale/template export.
3. P1: Fix invalid starter/reference task statuses.
4. P1: Stop nested-map frontmatter data loss.
5. P1: Add lease conformance and help docs.
6. P1: Enforce `required_extensions` and dry-run accounting.
7. P2: Tighten bundle shape validation and stale docs.

## Phase 0 — Audit and Project Setup

- [x] Create `docs/projects/in-progress/IMPROVEMENTS/`.
- [x] Create `IMPROVEMENTS_PRD.md`.
- [x] Create `IMPROVEMENTS_ARCHITECTURE.md`.
- [x] Create `IMPROVEMENTS_DEVELOPMENT_PLAN.md`.
- [x] Create `IMPROVEMENTS_PROJECT_TRACKER.md`.
- [x] Record the current `npm test` failure against `skills/push`.
- [x] Record the `resource_bound` sale export leak probe.
- [x] Record the invalid `status: open` starter/reference task issue.
- [x] Record dry-run import output reporting committed writes.
- [x] Reconcile overlapping open items from `SSSS_FRONTIER_IMPROVEMENTS`.

## Phase 1 — Restore Skill and Conformance Gate

- [x] Add real content under `skills/push/scripts/`.
- [x] Add real content under `skills/push/references/`.
- [x] Add `skills/push/evals/evals.json` with at least three assertions.
- [x] Add real content under `skills/push/subagents/`.
- [x] Run `node scripts/validate-skills.mjs` and record a passing result.
- [x] Run `npm test` and confirm the runner proceeds past skill validation.

## Phase 2 — Portability and Bundle Safety

- [x] Implement sale/template reduction for `resource_bound` primitives in
  `src/bundle.mjs`.
- [x] Strip or replace extension-declared bound fields using
  `registry/extensions/*` `resource.binds` metadata.
- [x] Fail export with a repairable error when a `resource_bound` primitive
  cannot be reduced safely.
- [x] Add conformance coverage proving seller-bound values do not appear in
  sale/template bundles.
- [x] Enforce `manifest.required_extensions[]` against loaded extension
  registries.
- [x] Reject bundles whose outer `files` property is missing or not an array.

## Phase 3 — Starter Project and CLI Correctness

- [x] Replace `status: open` with `status: pending` in `scripts/cmd-new.mjs`.
- [x] Replace `status: open` with `status: pending` in
  `scripts/build-reference-bundle.mjs`.
- [x] Add a smoke test that validates every generated starter vault file.
- [x] Fix `ssss import --dry-run` accounting so it reports would-commit counts.
- [x] Verify `ssss import --dry-run` leaves the target vault empty.

## Phase 4 — Operation Contract Coverage

- [x] Preserve nested frontmatter maps during patch serialization or reject the
  patch visibly.
- [x] Add nested-map regression coverage.
- [x] Add lease conformance coverage for conflict, mismatch, expiry, and
  unreadable lease state.
- [x] Add `docs/help/leases.md`.
- [x] Verify `node scripts/ssss.mjs help leases` prints the new topic.

## Phase 5 — Documentation and Tracker Sync

- [x] Update stale spec/package references in `skills/ssss-project-management`.
- [x] Cross-link deferred items now owned by `IMPROVEMENTS` from
  `SSSS_FRONTIER_IMPROVEMENTS`.
- [x] Update `README.md` and `docs/help/*` for changed behavior.
- [x] Update `conformance/README.md` if bundle, lease, or skill claims changed.
- [x] Add a final verification log entry with exact command results.

## Phase 6 — Testing and Verification

- [x] Run `node scripts/validate-skills.mjs`.
- [x] Run `node skills/ssss-registry-parity-auditor/scripts/run-parity-audit.mjs`.
- [x] Run `node scripts/conformance.mjs conformance --engine`.
- [x] Run `npm test`.
- [x] Run a resource-bound sale export leak probe.
- [x] Run a `ssss new` scaffold smoke test.
- [x] Run a `ssss import --dry-run` target-empty smoke test.
- [x] Run `git diff --check`.
- [x] Move the folder to `docs/projects/completed/IMPROVEMENTS/` only after all
  testing tasks pass.

## Verification Log

- 2026-07-08 — Project scaffolded with
  `node skills/ssss-project-management/scripts/scaffold-project.mjs IMPROVEMENTS --stage in-progress`.
- 2026-07-08 — `npm test` currently fails at skill conformance because
  `skills/push/{scripts,references,evals,subagents}` do not contain required
  real files.
- 2026-07-08 — `node skills/ssss-registry-parity-auditor/scripts/run-parity-audit.mjs`
  passes: registry/engine parity is clean.
- 2026-07-08 — Probe confirmed `src/bundle.mjs` emits a `resource_bound` domain
  file verbatim in a `sale` export, including `domain_name: secret.example`.
- 2026-07-08 — Probe confirmed the current generated task status `open` is
  rejected by the registry enum: allowed values are `pending`, `in_progress`,
  `done`, `failed`.
- 2026-07-08 — `node scripts/ssss.mjs import conformance/reference-bundle.ucw.json
  --vault /tmp/ssss-dry-run-vault --param business_name=Demo --param
  domain=demo.example --dry-run` reported `14 committed`, while the target
  vault remained empty.
- 2026-07-08 — Probe confirmed `validateBundle()` accepts an unknown
  `required_extensions` entry when the bundle hash is otherwise valid.
- 2026-07-08 — Probe confirmed `validateBundle()` accepts a missing `files`
  property when `file_count` is `0` and the empty content hash matches.
- 2026-07-08 — Implemented all `IMPROVEMENTS` phases. `node scripts/validate-skills.mjs`
  passed; `node skills/ssss-registry-parity-auditor/scripts/run-parity-audit.mjs`
  passed; `node scripts/conformance.mjs conformance --engine` passed with 23/23
  fixtures, 8/8 runtime checks, 7/7 operation regression checks, 9/9
  bundle/provisioning checks, and 2/2 CLI smoke checks.
- 2026-07-08 — `npm test` passed with the same full conformance suite.
- 2026-07-08 — Resource-bound sale export leak probe passed:
  `valid=true leaks=false`.
- 2026-07-08 — `ssss import --dry-run` smoke passed: reported `14 would commit`
  and left `files=0` in the target vault.
- 2026-07-08 — `ssss new` scaffold smoke passed: `validated=4` starter vault
  files.
- 2026-07-08 — `git diff --check` passed.
