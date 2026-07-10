---
type: project_document
title: SSSS_V1_BUSINESS_BUNDLE — Tracker
tags: ["project-management", "SSSS_V1_BUSINESS_BUNDLE"]
timestamp: 2026-06-24T16:00:00Z
---

# SSSS_V1_BUSINESS_BUNDLE — Tracker

> **Project Prefix**: `SSSS_V1_BUSINESS_BUNDLE`
> **Kanban State**: ✅ Completed (superseded / absorbed by SSSS 0.9.0)
> **Author**: Google Antigravity
> **Date**: 2026-06-24

---

> **Consolidation:** `SSSS_V1_STANDARDIZATION` was retired and folded in as **Track 0**.
> Status legend: `[ ]` todo · `[/]` in progress · `[x]` done · `[~]` done-with-deferral (note inline).

### Track 0 — Foundations (was SSSS_V1_STANDARDIZATION) ✅
- `[x]` Document `language_convention` in `ssss-spec.md` §11.7 (structural presentation overlay; never translates control keys)
- `[x]` Port festech `SsssValidator.ts` → `@gregiteen/ssss-cli`: satisfied by `src/registry.mjs` + `src/engine.mjs` (registry-driven validation over `registry/core.json`, no per-type code — supersedes a literal Zod/Proxy port)
- `[x]` Finalize `scripts/autolink.mjs` (deterministic + semantic layers, bundle-relative absolute paths, idempotent)

### Track A — Portability Classification (keystone)
- `[x]` Add `portability` to every primitive in `registry/core.json` (all 13 classified)
- `[x]` Classify `domain` / `phone_number` / `integration_connection` as `resource_bound` in `registry/extensions/festech.json` (new file; full festech extension registry lifted + classified)
- `[x]` Document `backup | template | sale` profiles + filter rule in spec §5.5
- `[~]` Generalize ultrachat export filter to read `portability` — residual host work (DEFERRED_BACKLOG); not blocking ssss package
- `[x]` Registry conformance check: `portability` required on all primitives (`scripts/conformance.mjs` `validateRegistry`)

### Track B — Operation Contract Reconciliation ✅
- `[x]` Lift TR pipeline into `@gregiteen/ssss-cli` canonical engine — `src/engine.mjs` (registry-driven, dependency-free): §6.3 pipeline, idempotency replay, `buildRepair`, leases, all 4 envelope types
- `[x]` Promote festech `delete` envelope → spec §6.2 + engine handler + registry contract primitive (fixtures already cover it as fixture-009)
- `[x]` Lift festech `resolveContainedPath` path-traversal guard into canon (`src/engine.mjs` `resolveContainedPath`)
- `[x]` Bump `spec_version` (0.2 → 0.3), VERSION, CHANGELOG, package.json, spec header + §14; error codes unchanged (still valid)
- `[x]` Reference engine runs all 9 fixtures in-process: `ssss conformance --engine` → 9/9 (wired into `npm test`)

### Track C — `.ucw` Bundle Format (spec §16) ✅
- `[x]` Promote ultrachat `VfsPackage`/`VfsPackageManifest` to spec §16 + registry `bundle` block
- `[x]` `categories → primitive_inventory` (registry-driven), `capabilities → provisioning[]`
- `[x]` Add `ssss_core_version` / `required_extensions` / `export_profile` / `provenance{content_hash,exporter,signature?}` to manifest
- `[x]` Adopt `WorkspaceTemplateVariableDefinition` as bundle `parameters[]` (§16.5)
- `[~]` Fold TR `metadata.schema.json` in as marketplace listing schema — provenance/signature cover attribution; full listing schema deferred to a marketplace track (not blocking v0.4)

### Track D — Provisioning Contract (spec §17) ✅
- `[x]` Spec `export / provision / import` (deterministic, idempotent, id-remap, binding) — §17 + `src/bundle.mjs`
- `[x]` Adopt `WorkspaceProvisioningStep.mode`/`system` + `WorkspaceGraphEdge.relation` as binding vocabulary (registry `provisioning` enums)
- `[x]` Composition (`installMode`) + v2→v1 upgrade via `migration` + structural-only `patch` (§17.4)

### Track E — Conformance ✅
- `[x]` Bundle conformance: profile filtering, full round-trip, id-remap link integrity, idempotent re-import, tenant_private drop (`runBundleConformance`)
- `[x]` Reference `.ucw` wired into `scripts/conformance.mjs` (`--engine` path; in `npm test`)
- `[~]` Cross-host proof (ultrachat ↔ festech engines) → reference engine is the in-repo oracle; live cross-host diff happens during Track F roll-out (`--endpoint` mode ready)

### Track F — Roll-out (re-derive apps from canon) ✅ (closed via 0.9 host phases)
- `[x]` total-recall: consumes `@gregiteen/ssss-cli@0.9`; package kernel default (`kernel-core`); Phase 8A
- `[x]` festech: package kernel default (`kernel`); host extension + SQL adapters; Phase 8B; processLegacy removed
- `[x]` ultrachat: package kernel default (`kernel`); Supabase VFS/durable adapters; Phase 8C; processOperationLegacy removed
- `[~]` Ultrachat export filter `portability` generalization — residual **host work** in DEFERRED_BACKLOG

### Track G — Reference Bundle ("Festival in a Box") ✅
- `[x]` Build first `.ucw` (sale profile) — `conformance/reference-bundle.ucw.json` via `scripts/build-reference-bundle.mjs` (deterministic, hash-stable)
- `[x]` Verify it strips `tenant_private` (the `task` ticket record is dropped; asserted in conformance)
- `[x]` Declare `resource_bound` requirements (domain, mailbox) as `parameters` + provisioning steps; provision round-trips green

### Verification Log
- 2026-06-24 — Project created; `SSSS_V1_STANDARDIZATION` consolidated into Track 0.
- 2026-06-24 — Docs grounded in real code across all three repos (TR operation-validator/schema,
  festech SsssValidator/primitive-registry/delete envelope, ultrachat VfsPackageService/workspace types).
- 2026-06-24 — **Track A landed.** `portability` added to all 13 core primitives; spec §5.5 written
  (classes + `backup|template|sale` profiles + `x_portability` override + drop-tenant_private rule);
  §5.1 table gains Portability column; registry `portability` block (classes, profiles, conformance).
  New `registry/extensions/festech.json` lifts festech's 16 extension primitives with `domain`/
  `phone_number`/`integration_connection` as `resource_bound` (incl. `resource.provision_relation`).
- 2026-06-24 — **Track B (spec side) landed.** `delete` promoted to canonical 4th envelope: spec §5.2,
  §6.1, §6.2 (semantics: tombstone replace-type, reject append-type, emit deletion event, idempotent),
  §6.3 pipeline stages 1/5/6; registry contract primitive added. Fixtures already had fixture-009.
- 2026-06-24 — Version bump 0.2 → 0.3 across spec header, §14, `VERSION`, `CHANGELOG.md`, registry
  `spec_version`. `node scripts/conformance.mjs conformance` → ✅ structure + ✅ registry portability.
- 2026-06-24 — **Track B fully landed.** Built the canonical reference engine — `src/engine.mjs`
  (§6.3 pipeline, 4 envelope types incl. `delete`, idempotency replay + cache, `buildRepair`,
  leases, festech `resolveContainedPath` guard), `src/registry.mjs` (registry-driven type
  resolution + `resolvePortability` honoring `x_portability`), `src/frontmatter.mjs` (zero-dep
  YAML frontmatter). Dependency-free; validates against `core.json` + `extensions/*`, no per-type
  code. `package.json` → 0.3.0, `exports` map, `main` = engine. `npm test` = `ssss conformance
  --engine` → **9/9 fixtures pass** (create/patch/event/delete/dry-run/idempotency/failure cases).
  Verified repair payload is byte-identical to fixtures, path traversal refused, delete of
  missing/append-type rejected, extension `domain` resolves to `resource_bound`.
- 2026-06-24 — **Tracks C, D, E, G landed; Track 0 closed (v0.4).** Spec gains §16 (the `.ucw`
  bundle format) and §17 (the provisioning contract); registry gains machine-readable `bundle`
  and `provisioning` schema blocks (manifest fields, provenance, parameter/step/edge/installMode
  vocabularies). Built `src/bundle.mjs` (dependency-free `exportBundle`/`validateBundle`/
  `provisionBundle`/`importBundle`) harvested+generalized from ultrachat `WorkspaceVfsPackageService`
  + `workspace.ts` types — portability- and registry-driven (no closed category/capability enums).
  Generated the canonical reference bundle `conformance/reference-bundle.ucw.json` ("Festival in a
  Box", sale profile) via deterministic `scripts/build-reference-bundle.mjs`; it ships 5 structural+
  resource_bound files and **drops the `tenant_private` task** (the keystone, proven). Wired
  `runBundleConformance()` into `ssss conformance --engine`: validate → provision → import →
  re-import round-trip. **Result: 9/9 fixtures + 6/6 bundle/provisioning checks** (schema+hash valid,
  no tenant_private, link integrity, every file committed, idempotent re-import, nothing private on
  disk). §11.7 documents `language_convention`. Version bumped 0.3 → 0.4 (spec header/§14, VERSION,
  CHANGELOG, registry `spec_version`, package.json + `./bundle` export). `conformance/README.md`
  drift items 1/3/4 marked resolved. **Only Track F (cross-repo roll-out) remains.**

## Project closure (2026-07-10)

- **Outcome:** Completed / absorbed. Canon foundations (portability, Operation Contract, `.ucw`,
  provisioning, conformance) shipped in this project; cross-repo roll-out finished under
  `SSSS_0_9_0_SEMANTIC_APPLICATION_KERNEL` Phases 8–9 with `@gregiteen/ssss-cli@0.9.0` published.
- **Salvage:** Any remaining host-only export polish is in `docs/projects/DEFERRED_BACKLOG.md`.
- **Location:** `docs/projects/completed/SSSS_V1_BUSINESS_BUNDLE/`.

