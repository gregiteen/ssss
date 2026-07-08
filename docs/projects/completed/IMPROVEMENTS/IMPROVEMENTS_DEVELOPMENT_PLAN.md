---
type: project_document
title: IMPROVEMENTS — Development Plan
tags: ["project-management", "IMPROVEMENTS"]
timestamp: 2026-07-08T22:12:44Z
---

# IMPROVEMENTS — Development Plan

> **Project Prefix**: `IMPROVEMENTS`
> **Kanban State**: ✅ Completed
> **Author**: Codex
> **Date**: 2026-07-08

---

## Phase 0 — Audit Baseline

Goal: preserve the current evidence before changing behavior.

1. Confirm the current failure state with `npm test` and
   `node scripts/validate-skills.mjs`.
2. Record the ranked findings in `IMPROVEMENTS_PRD.md`.
3. Cross-reference existing open items in `SSSS_FRONTIER_IMPROVEMENTS` so the
   implementation pass does not duplicate ownership.

Exit criteria: project docs exist, findings are ranked, and the tracker has a
final testing phase.

## Phase 1 — Restore the Canonical Conformance Gate

Goal: make the repo's single release signal green again.

1. Complete or remove `skills/push` from the published skill surface. Preferred:
   complete it with real `scripts`, `references`, `evals`, and `subagents`.
2. Ensure `skills/push/evals/evals.json` has at least three assertions and valid
   JSON.
3. Re-run `node scripts/validate-skills.mjs`.
4. Re-run `npm test` and capture whether remaining failures are engine,
   runtime, bundle, or docs issues.

Exit criteria: skill conformance passes and the full conformance runner reaches
all downstream checks.

## Phase 2 — Portability and Bundle Safety

Goal: make `sale` and `template` exports match the data-safety promise in spec
§5.5 and registry `portability.conformance`.

1. Add a resource-bound reduction path in `src/bundle.mjs`.
2. Use extension registry `resource.binds` metadata to strip seller-bound values.
3. Require or synthesize matching bundle `parameters[]` and provisioning steps,
   or fail export when reduction cannot be made safe.
4. Add conformance coverage proving a real-looking domain, phone, or integration
   value cannot appear in a sale/template bundle.
5. Enforce `required_extensions[]` against loaded extension registry IDs.
6. Require `bundle.files` to be an array during validation.

Exit criteria: probes for seller-bound values fail to leak, unknown extensions
are rejected, and malformed outer bundles fail validation.

## Phase 3 — Starter Project and CLI Correctness

Goal: ensure new SSSS consumers start from valid files and the CLI tells the
truth during provisioning.

1. Change generated task statuses from `open` to `pending` in
   `scripts/cmd-new.mjs`.
2. Change the reference bundle source task status from `open` to `pending` in
   `scripts/build-reference-bundle.mjs`.
3. Add a scaffold smoke test that validates all starter vault files, not only
   the sale-filtered output.
4. Fix import dry-run accounting so dry-run successes are reported as "would
   commit" rather than "committed".
5. Verify `--dry-run` leaves the target vault empty.

Exit criteria: `ssss new` generates a registry-valid vault and dry-run output is
not misleading.

## Phase 4 — Operation Contract Coverage

Goal: close the highest-impact untested operation semantics.

1. Fix `serializeDocument()` so nested maps are preserved or unsupported writes
   fail visibly.
2. Add nested-map patch regression coverage.
3. Add lease conformance coverage for conflict, mismatch, expiry, and unreadable
   lease state.
4. Add `docs/help/leases.md`.
5. Confirm `ssss help leases` discovers the new topic.

Exit criteria: data-loss and lease regressions fail deterministically.

## Phase 5 — Documentation and Tracker Sync

Goal: leave future agents with one coherent source of project truth.

1. Update stale spec/package references in `skills/ssss-project-management` and
   any affected docs.
2. Cross-link or migrate overlapping deferred tasks from
   `SSSS_FRONTIER_IMPROVEMENTS` into this tracker.
3. Update `conformance/README.md`, `README.md`, and `docs/help/*` only where
   behavior changed.
4. Add a verification log entry with exact commands and results.

Exit criteria: docs match the implementation and there are no duplicate owners
for the same improvement item.

## Phase 6 — Testing and Verification

Goal: prove the project can be archived safely.

Run and record:

1. `node scripts/validate-skills.mjs`
2. `node skills/ssss-registry-parity-auditor/scripts/run-parity-audit.mjs`
3. `node scripts/conformance.mjs conformance --engine`
4. `npm test`
5. `node scripts/ssss.mjs help leases`
6. A `sale` export leak probe for `resource_bound` values
7. A `ssss new` scaffold smoke test
8. A `ssss import --dry-run` target-empty smoke test
9. `git diff --check`

Exit criteria: all commands pass, tracker checkboxes are complete, and the
project folder can move to `docs/projects/completed/IMPROVEMENTS/`.
