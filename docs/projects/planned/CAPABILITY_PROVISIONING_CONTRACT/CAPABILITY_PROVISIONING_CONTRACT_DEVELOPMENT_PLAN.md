---
type: project_document
title: CAPABILITY_PROVISIONING_CONTRACT — Development Plan
tags: ["project-management", "CAPABILITY_PROVISIONING_CONTRACT"]
timestamp: 2026-09-26T00:00:00Z
---

# CAPABILITY_PROVISIONING_CONTRACT — Development Plan

> **Project Prefix**: `CAPABILITY_PROVISIONING_CONTRACT`
> **Kanban State**: 📋 Planned
> **Author**: Claude (Opus 5.5) with Greg Iteen
> **Date**: 2026-09-25

---

Every phase keeps the spec, `registry/core.json`, `src/`, and `conformance/fixtures.json` in agreement, and adds negative and replay cases.

## Phase 1 — Quick fixes (unblocks Total Recall Phase 1)

- Fix `registry compose` serialization (D1) with a CLI test.
- Fix `ssss new --with-total-recall --install` to run `init --project` (D7) with a scaffold test.

**Done when:** both commands pass their new tests, and the full suite is green.

## Phase 2 — Spec decisions

- Write the parameter-binding rule (G1), the deterministic id map (G2), and the grant decision (G5) into §16.5, §17.3, and §6.
- Get review before implementing.

**Done when:** the spec text is merged and the fixtures for it are written (failing).

## Phase 3 — Provisioning

- Parameter binding (D2), id and link remap with integrity against the target (D3), resource bindings (D4), dependency ordering (D5).

**Done when:** S2, S3, and S4 pass, and old bundles without `x_bind` provision unchanged.

## Phase 4 — Upgrade

- `upgradeBundle`, the `ssss upgrade` CLI, the `migration` record, and the engine-side `tenant_private` refusal (D6).

**Done when:** S5 passes, including the rejection case.

## Phase 5 — Cross-language and projections

- The wire-contract spec section, `ssss serve`, and `conformance --endpoint` against it (G3).
- The projection conformance suite (G4).
- Path grants, if chosen (G5).

**Done when:** S7, S8, and S9 pass.

## Phase 6 — Release

- Full code-quality tier, release notes for host maintainers (a changed provision result), a version bump, and a publish via the repo's push skill.
- Record the released version in Total Recall's `CAPABILITY_DEPLOYMENT_PLUGINS` tracker.

**Done when:** S10 passes and the tracker's verification phase is complete.
