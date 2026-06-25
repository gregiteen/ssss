---
type: project_document
title: SSSS_V1_BUSINESS_BUNDLE — Development Plan
tags: ["project-management", "SSSS_V1_BUSINESS_BUNDLE"]
timestamp: 2026-06-24T16:00:00Z
---

# SSSS_V1_BUSINESS_BUNDLE — Development Plan

> **Project Prefix**: `SSSS_V1_BUSINESS_BUNDLE`
> **Kanban State**: 🏗️ In Progress
> **Author**: Google Antigravity
> **Date**: 2026-06-24

---

Shape of the work: **harvest** the strongest implementation of each layer from the three repos →
**canonicalize** it in `ssss-spec.md` + `registry/core.json` + `@ssss/cli` → **conform** with
cross-host fixtures → **roll out** by re-deriving each app from the canon. Sequencing puts the
cheap keystone first, then the contract everything else rests on.

> **Status legend:** ✅ done · 🏗️ in progress · ⬜ not started. Per-task detail lives in the
> Tracker's Verification Log.
>
> **Progress (2026-06-24) — v0.4. In-repo standard is feature-complete:**
> - ✅ **Track 0** — Foundations. `language_convention` documented (spec §11.7); the
>   registry-driven reference engine (`src/registry.mjs` + `src/engine.mjs`) *is* the
>   `SsssValidator` port (validates against `core.json`, no per-type code); `scripts/autolink.mjs`
>   finalized (deterministic + semantic, bundle-relative paths).
> - ✅ **Track A** — Portability classification (spec §5.5, `registry/core.json`,
>   `registry/extensions/festech.json`, conformance check). Keystone complete.
> - ✅ **Track B** — `delete` envelope canonical (§6.2) + reference engine
>   (`src/{engine,registry,frontmatter}.mjs`), dependency-free, registry-driven, path-guarded.
> - ✅ **Track C** — `.ucw` bundle format (spec §16, registry `bundle`): manifest with
>   `ssss_core_version`/`required_extensions`/`export_profile`/`primitive_inventory`/`provenance`,
>   parameters from ultrachat `WorkspaceTemplateVariableDefinition`.
> - ✅ **Track D** — Provisioning contract (spec §17, registry `provisioning`): export/provision/
>   import verbs + ultrachat step/edge/installMode vocabularies, in `src/bundle.mjs`.
> - ✅ **Track E** — Conformance: reference bundle round-tripped (validate→provision→import→
>   re-import) by `ssss conformance --engine`. **9/9 fixtures + 6/6 bundle checks.** Drift log
>   in `conformance/README.md` updated (items 1, 3, 4 resolved).
> - ✅ **Track G** — Reference bundle `conformance/reference-bundle.ucw.json` ("Festival in a
>   Box"), a `sale`-profile export that proves the keystone: structural + resource_bound ship,
>   the `tenant_private` ticket is dropped. Built deterministically by
>   `scripts/build-reference-bundle.mjs`.
> - ⬜ **Track F** — Roll-out (re-derive festech/ultrachat/total-recall from the canon). This is
>   the only remaining track and is **cross-repo** — it edits the three application repos to
>   consume `@ssss/cli` instead of their local copies. Version 0.4.0.

### Track 0 — Foundations (absorbed from SSSS_V1_STANDARDIZATION)
1. Formalize `language_convention` in `ssss-spec.md` (festech already ships this primitive in
   `docs/ssss/primitive-registry.json` — document it, don't invent it).
2. Implement `@ssss/cli` `SsssValidator` — port festech's registry-driven validator
   (`apps/web/server/services/ssss/SsssValidator.ts`) onto `registry/core.json`; add the Proxy
   localization wrapper.
3. Finalize `scripts/autolink.mjs` (glossary, aliases, bundle-relative link rewriting) — this is
   the same rewrite engine provisioning's id-remap needs.

### Track A — Portability Classification (the keystone)
1. Add `portability` (`structural | tenant_private | resource_bound`) to every primitive in
   `registry/core.json`.
2. Classify festech's resource primitives (`domain`, `phone_number`, `integration_connection`)
   as `resource_bound` in `extensions/festech.json`.
3. Document the three export profiles (`backup | template | sale`) + the filter rule in spec §5;
   generalize ultrachat's hard-coded export filter (`WorkspaceVfsPackageService` ~L111–124) to read it.
4. Registry conformance check: every primitive MUST declare `portability`.

### Track B — Operation Contract Reconciliation (one engine)
1. Lift total-recall `src/core/operation-validator.mjs` + `src/core/schema.mjs` into `@ssss/cli`
   as the canonical engine (idempotency replay, `buildRepair` → §9, lease + authz hooks).
2. Promote festech's `delete` envelope into spec §6.2 and add `DeleteEnvelopeSchema`.
3. Lift festech's `resolveContainedPath` path-traversal guard into the canonical engine.
4. Reconcile error codes across hosts; bump `spec_version`; cut a `release`.

### Track C — The `.ucw` Bundle Format (spec §16)
1. Promote ultrachat `VfsPackage`/`VfsPackageManifest` to spec §16; rename
   `categories → primitive_inventory`, `capabilities → provisioning[]`.
2. Add `ssss_core_version`, `required_extensions[]`, `export_profile`, `provenance{content_hash,
   exporter, signature?}` to the manifest; keep `package.ucw.json` transport.
3. Adopt ultrachat `WorkspaceTemplateVariableDefinition` (`server/types/workspace.ts`) verbatim as
   the bundle `parameters[]` schema.
4. Fold total-recall `metadata.schema.json` in as the marketplace listing-metadata schema.

### Track D — The Provisioning Contract (spec §16.x)
1. Spec `export / provision / import` (deterministic, idempotent, id-remap, resource-binding).
2. Adopt ultrachat's vocabularies: `WorkspaceProvisioningStep.mode` and
   `WorkspaceGraphEdge.relation` as the canonical binding/dependency language.
3. Specify composition (bundle deps via `installMode`) + v2→v1 upgrade via `migration` +
   structural-only `patch`.

### Track E — Conformance (cross-host proof)
1. Fixtures in `conformance/fixtures.json`: profile filtering, full round-trip, id-remap link
   integrity, structural-only upgrade, `delete` semantics.
2. Author a reference `.ucw`; wire into `scripts/conformance.mjs`.
3. Run the reference bundle through ultrachat AND festech engines; assert identical state; log
   drift in `conformance/README.md`.

### Track F — Roll-out (re-derive apps from the canon)
1. total-recall: publish its core as `@ssss/cli`; consume the package instead of local copies.
2. festech: swap `SsssValidator.ts` + `primitive-registry.json` for `@ssss/cli` + core/extension
   registries; keep `delete` (now canonical).
3. ultrachat: swap `VfsPackage*` types for canonical §16 bundle types; keep the provisioning
   orchestrator, now standard-typed.

### Track G — Reference Bundle ("Festival in a Box")
1. Build the first real `.ucw` from festech as a sale-profile template.
2. Verify it strips `tenant_private` (no Workshop Collective customer data) and declares its
   `resource_bound` requirements (phone, domain, mailbox).
3. Dry-run `provision` into a fresh workspace to prove the end-to-end story.
