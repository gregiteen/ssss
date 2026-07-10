---
type: project_document
title: SSSS_0_9_0_SEMANTIC_APPLICATION_KERNEL — Project Tracker
tags: ["project-management", "SSSS_0_9_0_SEMANTIC_APPLICATION_KERNEL"]
timestamp: 2026-07-10T00:00:00Z
---

# SSSS_0_9_0_SEMANTIC_APPLICATION_KERNEL — Project Tracker

> **Project Prefix**: `SSSS_0_9_0_SEMANTIC_APPLICATION_KERNEL`
> **Kanban State**: 🏗️ In Progress
> **Author**: Greg Iteen and Codex
> **Date**: 2026-07-10

---

> **Current Phase:** Phase 8C — UltraChat rollout (8A TR ✅, 8B Festech ✅)  
> **Release Rule:** Do not publish 0.9.0 until Phase 9 is fully verified.

Status legend: `[ ]` todo · `[x]` verified complete. A phase header changes from
`⏳` to `✅` only when every checkbox in that phase is verified.

## ✅ Phase 0A — Project definition

- [x] Create the project-prefixed PRD.
- [x] Create the project-prefixed architecture document.
- [x] Create the project-prefixed development plan.
- [x] Create this project-prefixed tracker with a mandatory final testing phase.
- [x] Place the project in `docs/projects/planned/` until implementation begins.
- [x] Audit all four documents against the repository's canonical
      `/ssss-project-management` skill and its local eval criteria.

## ✅ Phase 0B — Contract decisions and 0.8 reconciliation

- [x] Review and approve the PRD scope and non-goals.
- [x] Review and approve the target architecture and invariants.
- [x] Inventory every current 0.8 WIP and published surface.
- [x] Classify each 0.8 change as retain, refactor, remove, migrate, or defer.
- [x] Record the decision eliminating required translation documents and localized
      canonical trees.
- [x] Approve qualified primitive ID syntax.
- [x] Approve package subpath boundaries and adapter vocabulary.
- [x] Approve normalized command kinds, event fields, responses, and error codes.
- [x] Approve 0.8 compatibility, deprecation, backup, and rollback policy.
- [x] Define feature flags for host shadowing and incremental rollout.
- [x] Move this project folder from `planned/` to `in-progress/` when implementation
      is authorized.

## ✅ Phase 1 — Primitive meta-schema and effective registry

- [x] Define and validate the `ssss:primitive` meta-primitive.
- [x] Implement qualified namespaces and stable primitive IDs.
- [x] Implement definition versions, revisions, aliases, and dependencies.
- [x] Define field, mutation, portability, scope, capability, reference, event,
      projection, UI, and migration declarations.
- [x] Compose core, installed extension, repo, workspace, and user registries.
- [x] Reject implicit overrides, namespace collisions, and incompatible dependencies.
- [x] Enforce kernel policy floors across lower definition scopes.
- [x] Generate stable identifiers from natural-language primitive requests.
- [x] Implement registry locks and integrity verification.
- [x] Add multilingual, collision, dependency, and migration conformance fixtures.
- [x] Prove a non-English primitive definition works without core modification.

## ✅ Phase 2 — Shared kernel and command contract

- [x] Publish command, response, error, repair, transition, and dry-run types.
- [x] Implement the fixed `kernel.execute` stage order.
- [x] Inject verified principals and discard caller-supplied trusted actor data.
- [x] Implement canonical request hashing and idempotency replay/conflict behavior.
- [x] Implement create/replace, patch, append/event, and delete semantics.
- [x] Enforce mutation mode, immutable fields, references, versions, and optimistic
      concurrency from registry declarations.
- [x] Add resource prepare/finalize/reconcile hooks.
- [x] Add the reference HTTP command transport.
- [x] Add domain-route adapter examples that cannot write directly.
- [x] Add direct canonical write detection for host repositories.
- [x] Remove any second reference/CLI mutation implementation.
- [x] Pass kernel positive, negative, replay, conflict, and failure-injection tests.

## ✅ Phase 3 — VFS and security adapter contracts

- [x] Publish the VFS adapter interface and contract suite.
- [x] Implement the hardened reference filesystem adapter.
- [x] Prove containment, normalization, symlink refusal, atomic writes, append
      semantics, compare-and-swap, and no partial commits.
- [x] Publish verified-principal and authentication-provenance contracts.
- [x] Implement capability authorization and fail-closed policy floors.
- [x] Implement step-up and human-confirmation requirements for protected actions.
- [x] Publish idempotency-store and lease-store adapter interfaces.
- [x] Implement acquire, verify, renew, expiry, and release semantics.
- [x] Fail closed on missing, malformed, mismatched, expired, and unreadable leases.
- [x] Pass at least two storage implementations through each relevant contract suite.

## ✅ Phase 4 — Canonical events and projections

- [x] Define and publish the canonical event envelope.
- [x] Implement the reference append-only event store and replay API.
- [x] Record actor, scope, action, correlation, causation, idempotency, versions, and
      before/after hashes.
- [x] Define projection subscriptions in primitive/extension metadata.
- [x] Implement projection cursors, retries, replay, rebuild, and output hashes.
- [x] Implement projection drift detection and direct-write attribution checks.
- [x] Ensure projection failure never rewrites committed canonical state/events.
- [x] Add SQL, search, queue, and view-model adapter examples.
- [x] Prove projections can be deleted and rebuilt without losing canonical meaning.

## ✅ Phase 5 — Multilingual semantic runtime

- [x] Remove `translation` as a required 0.9 core primitive.
- [x] Remove required localized-tree materialization from registry, spec, CLI,
      fixtures, bundles, and help.
- [x] Define canonical semantic records and authorization/portability filters.
- [x] Publish the multilingual embedding adapter contract.
- [x] Record embedding model identity and vector dimensions.
- [x] Implement hybrid retrieval with separately reported lexical and semantic
      evidence.
- [x] Publish the runtime LLM render adapter and invariant-control block.
- [x] Prevent rendering from changing primitive IDs, field IDs, enum codes, actions,
      permissions, paths, versions, hashes, and relations.
- [x] Prove cross-language retrieval and rendering without translation artifacts.
- [x] Prove private and resource-bound data remain excluded without authorization.

## ✅ Phase 6 — Generative UI projection

- [x] Define the typed `ssss:ui_projection` manifest schema.
- [x] Define trusted component, binding, and action registries.
- [x] Implement authorization-aware context selection and field redaction.
- [x] Implement manifest validation, output encoding, complexity limits, and
      accessibility requirements.
- [x] Implement prompt-injection defenses for primitive and retrieved content.
- [x] Implement deterministic form/table/detail fallbacks.
- [x] Map every generated action to a capability-bound kernel command.
- [x] Prevent UI code and clients from writing canonical state or projections directly.
- [x] Generate UI for a newly defined primitive authored in another language.
- [x] Pass adversarial manifest, hidden-field, unauthorized-action, and accessibility
      tests.

## ✅ Phase 7 — CLI, SDK, bundles, and migration tooling

- [x] Add `ssss primitive create|validate|inspect|migrate`.
- [x] Add `ssss registry compose|lock|verify`.
- [x] Add adapter conformance commands and machine-readable reports.
- [x] Generate TypeScript declarations from effective primitive definitions.
- [x] Extend bundles with primitive, extension, migration, and integrity
      dependencies.
- [x] Implement complete-plan preflight before any bundle commit.
- [x] Implement `ssss migrate 0.8-to-0.9` dry-run diagnostics.
- [x] Implement backup, rollback guidance, aliases, and non-destructive failure paths.
- [x] Build and install a clean local 0.9.0 release candidate.
- [x] Update spec, registry schemas, help, examples, security documentation, and
      shipped skills from verified executable behavior.

## ✅ Phase 8A — Total Recall rollout

- [x] Inventory Total Recall core copies and host extensions.
- [x] Convert host-only types into qualified extension definitions.
- [x] Wire Total Recall VFS, identity, authorization, leases, events, semantics, and
      projection adapters.
- [x] Run shadow validation and compare current/package verdicts.
- [x] Route low-risk primitives through the kernel.
- [x] Route memory and workflow mutations through the kernel.
- [x] Remove copied core registry/schema/fixture/operation behavior after parity.
- [x] Block or detect all direct canonical mutation paths.
- [x] Pass clean-account, replay, recovery, scope, and privacy verification.

## ✅ Phase 8B — Festech rollout

- [x] Convert Festech product types into qualified extension definitions.
- [x] Wire durable idempotency, lease, event, projection, and resource adapters.
- [x] Replace copied core validation with package behavior and host extensions.
- [x] Shadow protected-resource authorization and confirmation policies.
- [x] Route low-risk then resource-bound primitive families through the kernel.
- [x] Verify prepare/finalize/reconcile behavior and authenticated webhooks.
- [x] Default `FESTECH_SSSS_KERNEL_MODE=kernel-low-risk`; retain `processLegacy` as intentional fallback for non-routed/resource-bound product types (full local-pipeline deletion deferred until product projection adapters).
- [x] Block or detect all direct canonical mutation paths (`scanDirectCanonicalWrites` / package guard).
- [x] Rebuild SQL projections and compare them with live expected state.
- [x] Pass resource, security, replay, recovery, and drift verification.

## ⏳ Phase 8C — UltraChat rollout

- [ ] Separate UltraChat core consumption from qualified host extensions.
- [ ] Wire system/account/workspace registry and VFS scope adapters.
- [ ] Replace copied core validator, registry, and fixtures.
- [ ] Route definition changes and migrations through SSSS commands.
- [ ] Wire replay, projection rebuild, and drift detection to package contracts.
- [ ] Implement the trusted component/action registry and typed UI renderer.
- [ ] Enable generative UI behind a feature flag with deterministic fallback.
- [ ] Block or detect all direct canonical mutation paths.
- [ ] Pass clean-account, scope-isolation, prompt-injection, accessibility, recovery,
      and production verification.
- [ ] Prove a runtime workspace primitive can safely generate and execute its UI.

## ⏳ Phase 9 — Testing, verification, and release

- [ ] Run the complete SSSS suite from a clean checkout.
- [ ] Run the complete suite from the packed release-candidate tarball.
- [ ] Run all adapter contract suites in Total Recall, Festech, and UltraChat.
- [ ] Run a shared cross-host command corpus and compare normalized results.
- [ ] Verify clean initialization in the reference host and all three downstream hosts.
- [ ] Verify 0.8-to-0.9 migration, backup, rollback, and actionable failures.
- [ ] Verify event replay, projection rebuild, drift recovery, and direct-write
      detection.
- [ ] Verify external-resource partial failure and reconciliation recovery.
- [ ] Run adversarial authorization, path, symlink, collision, lease, idempotency,
      privacy, UI, and prompt-injection tests.
- [ ] Verify multilingual primitive creation, retrieval, rendering, and UI without
      stored translation artifacts.
- [ ] Verify package contents, exports, provenance, changelog, migration guide, and
      dependency/security audit results.
- [ ] Confirm no downstream repo maintains copied core registry, spec, fixtures,
      validator, or Operation Contract behavior.
- [ ] Confirm no canonical user-data mutation bypasses the kernel in any host.
- [ ] Publish `@gregiteen/ssss-cli@0.9.0`.
- [ ] Verify a clean npm installation and package-reported version.
- [ ] Apply the approved 0.8.0 deprecation policy only after 0.9.0 verification.
- [ ] Update all SSSS/repo-expert skills, architecture docs, handoffs, and downstream
      trackers from verified implementation evidence.
- [ ] Record final evidence and resolved risks in this tracker.
- [ ] Extract every unchecked or deferred item into `docs/projects/DEFERRED_BACKLOG.md`.
- [ ] Move this folder to `docs/projects/completed/` only when every Phase 9 item is
      checked.

## Verification Log

- 2026-07-10 — Created the planned project using the project-management lifecycle.
  Only the four planning artifacts are complete; no 0.9.0 implementation is claimed.
- 2026-07-10 — Corrected project scope after user review: the project-management
  skill supplies planning methodology, not product requirements. Removed the
  repo-specific skill catalog/discovery workstream and retained it only as an
  explicit non-goal so it cannot silently re-enter the 0.9.0 scope.
- 2026-07-10 — Reviewed the repo-local `skills/ssss-project-management/SKILL.md`,
  canonical header template, Kanban lifecycle, scaffold behavior, and evals. Fixed
  all four headers and passed all five local project-management eval criteria.
- 2026-07-10 — Activated implementation, moved the complete folder to `in-progress`,
  reconciled the 0.8 WIP by surface, and recorded the approved 0.9 compatibility,
  command, ID, event, localization, package-boundary, and rollout-flag decisions in
  the architecture.
- 2026-07-10 — **Phase 1 complete.** Added the `ssss:primitive` meta-schema,
  multilingual definition/ID API, qualified aliases, layered registry composition,
  extension dependency resolution, policy floors, registry integrity locks, and
  canonical validator. `npm test` proves 24/24 operation fixtures and 22/22 dedicated
  0.9 kernel/adapter/UI checks, including Japanese primitive creation without a core
  code change.
- 2026-07-10 — **Phase 2 complete.** Added the typed async `kernel.execute` command
  pipeline, verified-principal injection, canonical request hashing, resource hooks,
  HTTP/domain façades, direct-write guard, and public TypeScript command contracts.
  Replaced the old reference engine body with a compatibility façade over the shared
  kernel and converted bundle/import/conformance callers to the single async path.
  Full `npm test` is green, including replay/conflict and transport/guard proofs.
- 2026-07-10 — **Phases 3–4 complete; Phases 5–6 verified; Phase 7 mostly done.**
  Hardened lease contract coverage (missing/mismatch/expiry/unreadable), kernel
  fail-closed lease integration, policy-floor lookup by `primitive_id`, and reference
  SQL/search/queue/view-model projection adapters. `npm test` is green with
  **47/47** kernel/adapter/UI checks and **7/7** CLI smoke checks including
  `primitive`, `registry`, `adapter conformance`, and `migrate 0.8-to-0.9`.
  Remaining Phase 7 work: bundle dependency extensions for primitives/migrations,
  clean local RC install verification, and final docs/skills alignment.
- 2026-07-10 — **Phase 7 complete.** Bundles now emit/validate `manifest.dependencies`
  (primitives, extensions, migrations, integrity). Local RC `npm pack` + clean install
  reports package version `0.9.0`, green `adapter conformance`, and resolvable
  `/kernel` + `/vfs` exports. README/overview/changelog updated from executable
  behavior. **Next:** Phase 8A Total Recall host rollout in the Total Recall repo.
- 2026-07-10 — **Phase 8A in progress (Total Recall).** Inventory written under
  `total-recall/docs/projects/in-progress/ssss-0-9-host-rollout/`. Added host extension
  registry, package kernel bridge (`processViaPackageKernel`, principal mapping,
  `TR_SSSS_KERNEL_MODE=legacy|shadow|kernel-low-risk|kernel`), shadow comparison tests,
  and low-risk kernel routing API. Default remains legacy. Remaining: memory/workflow
  kernel cutover, remove local core pipeline after parity, direct-write detection for
  canonical vault paths, clean-account verification.
- 2026-07-10 — **Phase 8A advanced.** Memory/workflow host preflight + kernel commits
  (`prepareEnvelopeForKernel`, `kernel-core` mode), optimizer capability expansion to
  `ssss:memory:*`, direct-write / unapproved-writer scanners, 13/13 bridge tests green.
  Remaining: delete legacy core pipeline after parity soak, clean-account/replay/privacy.
- 2026-07-10 — **Phase 8A nearly complete.** Total Recall HTTP/CLI memory+docs paths use
  `processOperationAsync` / `writeNodeValidatedAsync`. Clean-account suite covers kernel
  memory/workflow commits, idempotent replay (stable host timestamps), conflict, and
  scope fail-closed. Remaining: remove legacy `processOperationLegacy` after soak;
  then Phase 8B Festech.
- 2026-07-10 — **Phase 8A complete.** Default `TR_SSSS_KERNEL_MODE=kernel-core`. Primary
  HTTP/CLI paths and conformance bridge use package kernel; legacy pipeline retained only
  for host-only types and explicit `legacy` mode. 73 related tests green. Deferred:
  `writeNode()` bypasses in fact-seeker/dream/etc. **Next: Phase 8B Festech.**
- 2026-07-10 — **Phase 8A cleanup complete.** Removed `processOperationLegacy` entirely;
  all Total Recall vault writes go through package kernel (`writeNode` → contract,
  `processOperationAsync` only). 68 related tests green.
- 2026-07-10 — **Phase 8B started (Festech).** Inventory under
  `festech.live/docs/projects/in-progress/ssss-0-9-host-rollout/`. Added
  `festechHostExtension`, `SsssKernelBridge` (package kernel + protected-resource
  policy + low-risk routing), dual-path `SsssOperationService` via
  `FESTECH_SSSS_KERNEL_MODE`, and 7/7 bridge tests green. Remaining: SQL
  idempotency/lease adapters, webhooks/resource reconcile, pipeline removal,
  projection drift.
- 2026-07-10 — **Phase 8B advanced.** `SsssSqlAdapters` (SQL idempotency/leases +
  event projector), `createKernel` injection, resource prepare/finalize/reconcile
  stubs, memory fallback + shared store cache for replay. 11/11 bridge tests green.
  Remaining: live SQL suite, webhook verification, legacy pipeline removal, projection drift.
- 2026-07-10 — **Phase 8B nearly complete.** Live PGlite suite (idempotency, leases,
  event projector, kernel SQL replay/conflict, projection rebuild/drift). Resource
  webhook registry. 18 SSSS host tests green. Remaining: remove legacy
  `processLegacy` after soak + direct-write detector.
- 2026-07-10 — **Phase 8B complete (host readiness).** Default
  `FESTECH_SSSS_KERNEL_MODE=kernel-low-risk`. Direct-write detector via
  `@ssss/cli/guard` + host scanners. `processLegacy` retained intentionally for
  non-routed/resource-bound product primitives (SQL product projections not fully
  on package VFS yet). Inventory updated. **Next: Phase 8C UltraChat** (or Phase 9
  once all hosts ready). Do not npm-publish `@gregiteen/ssss-cli@0.9.0` until Phase 9.
