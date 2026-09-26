---
type: project_document
title: CAPABILITY_PROVISIONING_CONTRACT — Project Tracker
tags: ["project-management", "CAPABILITY_PROVISIONING_CONTRACT"]
timestamp: 2026-09-26T00:00:00Z
---

# CAPABILITY_PROVISIONING_CONTRACT — Project Tracker

> **Project Prefix**: `CAPABILITY_PROVISIONING_CONTRACT`
> **Kanban State**: 📋 Planned
> **Author**: Claude (Opus 5.5) with Greg Iteen
> **Date**: 2026-09-25

---

Consumer: `gregiteen/total-recall` → `docs/projects/in-progress/CAPABILITY_DEPLOYMENT_PLUGINS/` (Phase 1 depends on this project).

## ✅ Phase 0: Scope

Goal: Record what capability provisioning needs from SSSS, with evidence.

- [x] [AUDIT](CAPABILITY_PROVISIONING_CONTRACT_AUDIT.md): 7 verified defects, 5 spec gaps (M)
- [x] [PRD](CAPABILITY_PROVISIONING_CONTRACT_PRD.md), [ARCHITECTURE](CAPABILITY_PROVISIONING_CONTRACT_ARCHITECTURE.md), [DEVELOPMENT_PLAN](CAPABILITY_PROVISIONING_CONTRACT_DEVELOPMENT_PLAN.md) (M)

## ⏳ Phase 1: Quick fixes

Goal: Unblock Total Recall's composer work.

- [x] D1 `scripts/cmd-registry.mjs`: serialize `set.types`; CLI regression test for `registry compose` (S)
- [x] D7 `scripts/cmd-new.mjs`: `total-recall init --project` in the new dir; scaffold test (S)

## ⏳ Phase 2: Spec decisions

Goal: Settle the contract before code.

- [ ] G1 §16.5: frontmatter `x_bind` parameter binding rule + failing fixtures (M)
- [ ] G2 §17.3: deterministic id map definition + failing fixtures (M)
- [ ] G5 §6: path-scoped grants (option A) or type-namespace isolation (option B), recorded with fixtures (S)
- [ ] User review of G1/G2/G5 (S)

## ⏳ Phase 3: Provisioning

Goal: A bundle becomes a self-consistent, parameterized instance.

- [ ] D2 `src/bundle.mjs`: apply `x_bind` values; type-check; strip `x_bind` (M)
- [ ] D3 `src/bundle.mjs`: id/slug/workspace/link remap via the autolink rewrite; integrity vs remapped target (L)
- [ ] D4 `src/bundle.mjs`: `bindings` in the provision result; unbound required resource fails (M)
- [ ] D5 `src/bundle.mjs`: dependency resolution, topological order, cycle error, suggested list (M)
- [ ] `scripts/cmd-provision.mjs` / `cmd-import.mjs`: `--param`, `--dependency`, JSON output (S)
- [ ] Fixtures: two-workspace install (S2), determinism (S3), dependencies (S4), legacy bundle unchanged (M)

## ⏳ Phase 4: Upgrade

Goal: Structural-only upgrades that can never write tenant data.

- [ ] D6 `src/bundle.mjs` `upgradeBundle` + `migration` record (L)
- [ ] D6 engine: refuse `tenant_private` targets in upgrade patches (M)
- [ ] `ssss upgrade` CLI with `--dry-run` (S)
- [ ] Fixtures: structural change applied, tenant document untouched, violating patch rejected (M)

## ⏳ Phase 5: Cross-language and projections

Goal: Non-JavaScript hosts and SQL projections can prove conformance.

- [ ] G3 spec: HTTP/JSON wire contract section (M)
- [ ] G3 `ssss serve` reference server (dependency-free) (M)
- [ ] G3 `ssss conformance --endpoint` passes against `ssss serve` (S)
- [ ] G3 `ssss bridge` stdin-JSON command, standardizing Dabber CRM's `scripts/ssss-store.mjs`; conformance via subprocess; migrate Dabber to it (M)
- [ ] G4 `projection_memory` adapter suite: rebuild, incremental = rebuild, drift, replay (M)
- [ ] G5 authorizer path grants, if option A (M)

## ⏳ Phase 6: Verification and release

Goal: Ship a contract Total Recall can depend on.

- [ ] Full code-quality tier and conformance suite green (M)
- [ ] Release notes for host maintainers (changed provision result, new verbs) (S)
- [ ] Version bump + publish via the push skill; record the version in Total Recall's `CAPABILITY_DEPLOYMENT_PLUGINS` tracker (S)
- [ ] `check-project-docs.mjs CAPABILITY_PROVISIONING_CONTRACT` passes before archival (S)

## Verification Log

- 2026-09-25: Reproduced D1 with the installed CLI 0.9.6 (`ssss registry compose` → `undefined is not iterable`). `ssss new` scaffold succeeded in a temp dir. Read `src/bundle.mjs` `provisionBundle` (D2–D5), `scripts/cmd-new.mjs:124` + Total Recall `src/cli/init.mjs` (D7), `src/authorization.mjs` (G5), `src/http.mjs` (G3). `ssss adapter conformance`: 6/6 suites pass (vfs/lease/idempotency × memory/filesystem); no projection suite (G4). No code changed.
- 2026-09-26: Fixed D1 and D7. CLI smoke checks now compose a generated extension and scaffold with stubbed install commands, proving `total-recall init --project` runs in the new directory. Full code-quality tier on the Mac mini passed both conformance checks with zero findings.
