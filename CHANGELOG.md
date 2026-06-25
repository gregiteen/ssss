# Changelog

All notable changes to the SSSS (Structured Semantic Syntax System) spec will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-06-24
### Added
- **The `.ucw` bundle format (spec §16, registry `bundle`)** — the canonical transportable
  package of a vault: a manifest plus path-sorted files, content-hashed for integrity. The
  manifest declares `ssss_core_version`, `required_extensions`, `export_profile`,
  `primitive_inventory` (registry-driven, replacing ultrachat's closed `categories` enum),
  `provisioning[]`, `parameters[]`, and `provenance{content_hash, exporter, signature?}`.
  Harvested from ultrachat's `WorkspaceVfsPackageService` and generalized to be portability-
  and registry-driven.
- **The provisioning contract (spec §17, registry `provisioning`)** — three deterministic,
  idempotent verbs: `export` (pure, profile-filtered), `provision` (params + link-integrity
  + id-remap → replayable envelope plan), `import` (engine replay, idempotent via
  idempotency_key). Adopts ultrachat's `WorkspaceProvisioningStep.mode`/`system` and
  `WorkspaceGraphEdge.relation` as the canonical binding/dependency vocabularies, plus
  `installMode` composition and structural-only `migration`+`patch` upgrades.
- **Reference engine for bundles (`src/bundle.mjs`)** — dependency-free `exportBundle`,
  `validateBundle`, `provisionBundle`, `importBundle` over the registry bundle schema.
- **Reference bundle (`conformance/reference-bundle.ucw.json`, "Festival in a Box")** — a
  real `sale`-profile bundle, built deterministically by `scripts/build-reference-bundle.mjs`.
  Proves the §5.5 keystone: structural + resource_bound files ship, the `tenant_private`
  ticket record is dropped. Round-tripped (validate → provision → import → re-import) by
  `ssss conformance --engine`; 6/6 bundle/provisioning checks pass alongside the 9 fixtures.
- **`language_convention` documented (spec §11.7)** — the festech-shipped, `structural`
  presentation-overlay primitive, formally placed in the semantic layer.
- **CLI command surface for the full lifecycle** — `ssss export`, `validate`, `inspect`,
  `provision`, and `import` wire the bundle/provisioning verbs to the command line, plus
  `ssss help [topic]` serving offline docs from `docs/help/` and `ssss version`. Each
  command has its own `--help`. Shared parsing/formatting in `scripts/lib/cli.mjs`.
- **Open-source packaging** — `README.md`, `LICENSE` (ISC), `.gitignore`, and
  `package.json` metadata (`engines`, `repository`, `files`) so `@ssss/cli` is
  publishable and the runtime-read paths (`VERSION`, `docs/help`) ship in the tarball.

### Changed
- Registry `spec_version` → `0.4`; spec header + §14 → v0.4. Engine exports add `./bundle`.

## [0.3.0] - 2026-06-24
### Added
- **Portability classification (spec §5.5, registry `portability`)** — every document
  primitive now declares a portability class: `structural` (the sellable business model),
  `tenant_private` (the operator's private data, never sold), or `resource_bound` (needs a
  real resource bound at provision). Export profiles `backup | template | sale` are filters
  over these classes; `template`/`sale` exports MUST drop all `tenant_private` primitives.
  Files MAY override their type default with `x_portability`. Lifted and generalized from
  ultrachat's ad-hoc export filter in `WorkspaceVfsPackageService`.
- **`delete` envelope (spec §6.2)** — promoted from festech's `SsssOperationService` into
  the canonical Operation Contract as the fourth envelope type. Removes a replace-type file,
  rejects append-type targets, and emits a deletion event for audit. Idempotent.
- **Reference engine (`src/engine.mjs`, `src/registry.mjs`, `src/frontmatter.mjs`)** — the
  canonical, dependency-free `@ssss/cli` Operation Contract engine. Harvested from total-recall
  (§6.3 pipeline, idempotency replay from the audit log, `buildRepair`/§9 repair blocks) and
  festech (`delete` envelope, `resolveContainedPath` path-traversal guard, registry-driven
  content validation). Validates content against `registry/core.json` + `registry/extensions/*`
  with no per-type code and no Zod/YAML dependency. Runs all 9 conformance fixtures in-process
  via `ssss conformance --engine` (now wired into `npm test`).

### Changed
- Registry now defines **5 contract primitives** (added `delete`); `spec_version` → `0.3`.
- §5.1 Document Primitives table gains a **Portability** column.
