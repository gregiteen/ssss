# Deferred Backlog

Items intentionally not completed in an active project phase.

## SSSS 0.9.0 Phase 9 deferrals (2026-07-10) — CLOSED 2026-07-10

All items completed:

- [x] Live UltraChat production Supabase durable/VFS soak — `scripts/ssss/live-supabase-soak.mjs` (probe PASS against live tables).
- [x] Full deletion of Festech `processLegacy` — package kernel only (`SsssOperationService.process` → `processViaPackageKernel`); default `FESTECH_SSSS_KERNEL_MODE=kernel`.
- [x] Full deletion of UltraChat `processOperationLegacy` — package kernel only after host auth; default `UC_SSSS_KERNEL_MODE=kernel`; VfsEventRouter post-hooks retained.
- [x] Host-copied validators demoted to read-side helpers (not mutation authority); mutation uses package `createValidator` via host extension composition.
- [x] npm deprecation of `@gregiteen/ssss-cli@0.8.0` (applied during Phase 9).
- [x] Provenance/SBOM automation — `scripts/generate-sbom.mjs` → `artifacts/sbom-0.9.0.spdx.json`.


## Salvaged from closed pre-0.9 projects (2026-07-10)

Moved from abandoned "in-progress" trackers — not blocking 0.9.0:

- Optional: publish JSON Schema for `registry/core.json` and `.ucw` manifest (was FRONTIER Phase 3).
- Optional: migration fixture proving structural-only patch leaves `tenant_private` untouched (FRONTIER Phase 3; migrate CLI dry-run exists).
- Host-only (UltraChat): generalize export filter to read `portability` (V1 Track A/F roll-out residue).
- Host-only (Total Recall repo): skill deployer push/publish command (FRONTIER Phase 4 out-of-repo note).
- Note: registry integrity lock shipped in 0.9 as `ssss registry lock|verify` (satisfies intent of FRONTIER `ssss-lock.json` design).
