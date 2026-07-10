# Changelog

All notable changes to the SSSS (Structured Semantic Syntax System) spec will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.0] - Unreleased
### Added
- Shared application kernel (`kernel.execute`) with verified-principal injection,
  canonical request hashing, idempotent replay/conflict, resource prepare/finalize/
  reconcile hooks, and TypeScript command contracts under `@gregiteen/ssss-cli/kernel`.
- Host adapter contracts and dual reference implementations for VFS, identity/
  capability authorization, leases, idempotency, events, projections, semantic
  retrieval/rendering, and generative UI manifests.
- Runtime primitive authoring (`ssss:primitive` meta-schema), layered registry
  composition, aliases, dependency ranges, policy floors, and registry integrity locks.
- CLI surfaces: `ssss primitive`, `ssss registry`, `ssss adapter conformance`, and
  `ssss migrate 0.8-to-0.9` dry-run diagnostics with backup manifests.
- Bundle `manifest.dependencies` for primitives, extensions, migrations, and
  integrity digests aligned with provenance.
- Dedicated 0.9 conformance suite covering adapters, kernel leases, projection
  rebuild/drift isolation, UI adversarial cases, and CLI smoke paths.

### Changed
- Core registry/spec version is now `0.9`. Canonical documents are authored once;
  multilingual presentation uses embedding/render adapters instead of stored
  translation trees.
- The reference engine is a compatibility façade over the shared kernel; hosts must
  inject adapters rather than re-implement mutation stages.

### Removed
- The `translation` document primitive and required localized-vault materialization
  workflow from the 0.9 core surface.

## [0.8.0] - 2026-07-10
### Changed
- Core registry/spec version is now `0.7`. Registry `patterns`,
  `immutable_fields`, and `references` are enforced by the reference engine and
  covered by the parity auditor.
- Bundle import now preflights the complete envelope plan before committing, so a
  late invalid document cannot leave a partial installation.
- Bundle validation now applies all registry field constraints and returns
  structured errors for malformed file entries instead of throwing.

### Fixed
- Bundle provenance now uses the real published package identity,
  `@gregiteen/ssss-cli`, instead of an unavailable package alias. The
  reference bundle derives its exporter name and version from `package.json`.

### Added
- A tracked, first-class `ssss` skill package with evidence-first canon routing,
  a dependency-free document validator, contract reference, evals, and audit
  prompt. The skill is included in the npm package allowlist.
- Conformance checks that pin default and reference-bundle exporter identities
  to current package metadata.
- The `translation` document primitive and spec §11.9 semantic/localization
  contract: exact-hash structural sources, immutable overlay identity, and
  natural-language-only translated fields.
- `@gregiteen/ssss-cli/semantic`, `ssss semantic`, and `ssss localize` for
  deterministic Unicode search/graph projections and non-destructive localized
  materialization through a whole-projection staging directory.
- Fail-closed extension registry composition for malformed fields, invalid
  regular expressions, symlinks, reserved ids, and core/sibling collisions.
- Privacy-safe semantic defaults that exclude `tenant_private` and
  `resource_bound` data unless explicitly requested in an authorized context.
- Conformance fixtures 024–026 plus dedicated extension-registry,
  semantic/localization, and expanded CLI smoke groups.
- Offline help for semantic search and localization, plus a security/UX impact
  report for downstream host implementers.

## [0.7.1] - 2026-07-08
### Fixed
- Reduced `resource_bound` primitives to requirement declarations in `template`
  and `sale` exports, preventing seller-bound domain, phone, or integration
  values from leaking into bundles.
- Rejected malformed bundles with missing `files` arrays and unknown
  `required_extensions`.
- Preserved nested frontmatter maps and arrays during patch serialization.
- Corrected `ssss import --dry-run` accounting to report `would commit` counts
  while leaving target vaults empty.
- Generated starter and reference task files now use the valid `pending` task
  status.

### Added
- Conformance coverage for resource-bound export reduction, strict bundle
  validation, lease conflict/expiry/unreadable-state behavior, nested
  frontmatter patching, `ssss new` scaffold validation, and dry-run import
  behavior.
- `docs/help/leases.md` and completed `IMPROVEMENTS` project documentation.
- Full package content for the `push` skill so skill conformance passes.

## [0.7.0] - 2026-07-02
### Changed
- **BREAKING: universal frontmatter enforcement** — every SSSS document primitive
  now requires `type`, `title`, `description`, and `timestamp`. Primitive-specific
  required fields still apply after these universal fields.
- Registry `spec_version` -> `0.6`; spec header -> v0.6 draft. Reference bundle
  metadata now targets SSSS core `0.6`.
- The reference engine, bundle validator, skill validator, runtime helpers,
  scaffold output, conformance fixtures, shipped skills, and reference bundle now
  share the universal metadata requirement.

### Added
- OKF compatibility guidance documenting `resource`, `tags`, and `aliases` as
  recommended discovery enrichment fields while keeping the mandatory universal
  metadata minimal and deterministic.
- Security hardening for the reference engine and CLI:
  - VFS paths now reject absolute, root, dot-segment, empty-segment, backslash,
    and directory targets.
  - `workspace_id`, `idempotency_key`, and role names are constrained to safe
    filesystem identifiers.
  - Idempotency replay is bound to a request hash; same-key/different-payload
    requests now fail as conflicts.
  - Leases fail closed when unreadable and no longer derive filenames directly
    from raw VFS paths.
  - Bundle validation rejects unsafe and duplicate file paths, and export refuses
    symlinked vault entries.
  - Autolink skips symlinked Markdown targets before `--write`.
  - Repo-local skill utility scripts avoid shell-string execution and validate
    write-target names.

## [0.6.0] - 2026-07-02
### Added
- **Workflow Runtime & Daemon Contract (spec §11.8)** — standardizes workflow
  trigger evaluation across daemon, cron, webhook, file-change, event, condition,
  and manual runtimes. Workflows own `triggers[]`; external schedulers are only
  wake-up mechanisms.
- **`@gregiteen/ssss-cli/runtime` helpers** — deterministic `planWorkflowTrigger()` and
  `createRunEnvelope()` helpers derive `workflow_triggered` events, task
  documents, and run documents through the Operation Contract.
- **Runtime conformance metadata/checks** — `conformance/fixtures.json` v1.3.0
  declares trigger/misfire/concurrency vocabularies and proves duplicate daemon
  ticks replay idempotently.

### Changed
- Registry `spec_version` -> `0.5`; spec header -> v0.5 draft. Reference bundle
  metadata now targets SSSS core `0.5`.

## [0.5.0] - 2026-06-25
### Added
- **`ssss new <dir>` scaffolder** — bootstrap a fresh SSSS-native repo in one command:
  a starter `vault/` of core primitives (incl. a `tenant_private` task to demonstrate
  the sale-drop), a dependency-free conformance test (`node --test`) that replays the
  canonical fixtures through the engine and round-trips the vault as a `sale` bundle,
  plus `package.json` (pinned to the matching `@gregiteen/ssss-cli` tag), `CLAUDE.md`, `README`,
  and `.gitignore`. Flags: `--with-total-recall` (wire the Total Recall memory OS),
  `--install` (npm install + Total Recall init + verify), `--ref`, `--name`, `--force`,
  `--no-git`. All shelling-out uses `execFileSync` with fixed argv (no shell). Docs:
  `ssss help scaffold`.

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
  `package.json` metadata (`engines`, `repository`, `files`) so `@gregiteen/ssss-cli` is
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
  canonical, dependency-free `@gregiteen/ssss-cli` Operation Contract engine. Harvested from total-recall
  (§6.3 pipeline, idempotency replay from the audit log, `buildRepair`/§9 repair blocks) and
  festech (`delete` envelope, `resolveContainedPath` path-traversal guard, registry-driven
  content validation). Validates content against `registry/core.json` + `registry/extensions/*`
  with no per-type code and no Zod/YAML dependency. Runs all 9 conformance fixtures in-process
  via `ssss conformance --engine` (now wired into `npm test`).

### Changed
- Registry now defines **5 contract primitives** (added `delete`); `spec_version` → `0.3`.
- §5.1 Document Primitives table gains a **Portability** column.
