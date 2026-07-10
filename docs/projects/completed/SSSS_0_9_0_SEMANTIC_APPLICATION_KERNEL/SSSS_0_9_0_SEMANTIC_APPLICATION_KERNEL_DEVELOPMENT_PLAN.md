---
type: project_document
title: SSSS_0_9_0_SEMANTIC_APPLICATION_KERNEL — Development Plan
tags: ["project-management", "SSSS_0_9_0_SEMANTIC_APPLICATION_KERNEL"]
timestamp: 2026-07-10T00:00:00Z
---

# SSSS_0_9_0_SEMANTIC_APPLICATION_KERNEL — Development Plan

> **Project Prefix**: `SSSS_0_9_0_SEMANTIC_APPLICATION_KERNEL`
> **Kanban State**: 🏗️ In Progress
> **Author**: Greg Iteen and Codex
> **Date**: 2026-07-10

---

> **Execution Rule:** Complete and verify each phase before beginning dependent work.

## 0. Delivery Strategy

This is a breaking pre-1.0 consolidation, not a feature pile. Work proceeds from
canonical contracts outward:

```text
decisions and drift reconciliation
  -> primitive and registry model
  -> kernel and adapters
  -> semantics and UI
  -> packaging and migration
  -> host rollout
  -> final verification and release
```

Each implementation change must map to a tracker checkbox and add or update an
executable conformance check. Current uncommitted 0.8 work must be reconciled rather
than overwritten wholesale.

## Phase 0 — Freeze the 0.9 contract and reconcile 0.8 drift

### Goal

Establish a reviewable baseline before implementation.

### Work

1. Approve the PRD, architecture, development plan, and tracker.
2. Inventory current 0.8 WIP and published package behavior by surface.
3. Classify each current change as retain, refactor, remove, migrate, or defer.
4. Record the decision to remove required translation documents/localized trees and
   replace them with multilingual semantic and render adapters.
5. Decide the package export map, qualified-ID syntax, and feature-flag names.
6. Define compatibility and deprecation policy for 0.8.0.
7. Freeze normalized error codes, event fields, command kinds, and adapter vocabulary.

### Gate

No kernel implementation begins until the decisions are captured and the current
working tree has a safe reconciliation strategy.

## Phase 1 — Primitive meta-schema and effective registry

### Goal

Make any authorized repo or user able to define a primitive without changing core.

### Work

1. Add the `ssss:primitive` meta-schema and package API.
2. Define namespaces, stable IDs, versions, revisions, aliases, dependencies, and
   collision behavior.
3. Define field, validation, mutation, portability, scope, capability, reference,
   event, projection, UI, and migration declarations.
4. Implement registry composition from core, installed extensions, repo, workspace,
   and user scopes.
5. Add policy floors that lower scopes cannot weaken.
6. Add generated identifiers for natural-language primitive creation.
7. Add registry lock and integrity verification.
8. Add positive, negative, collision, upgrade, and multilingual fixtures.

### Gate

A non-English primitive definition composes deterministically, validates, versions,
and survives serialization without requiring core modification.

## Phase 2 — Shared kernel and command contract

### Goal

Make one package-owned state machine the only mutation authority.

### Work

1. Define stable TypeScript/JavaScript command, response, error, repair, and dry-run
   types.
2. Implement the required stage order in `kernel.execute`.
3. Separate verified principal injection from caller payloads.
4. Implement canonical request hashing and exact replay/conflict semantics.
5. Implement create/replace, patch, append/event, and delete transitions from
   registry declarations.
6. Enforce immutable fields, references, versions, and optimistic concurrency.
7. Add external-resource prepare/finalize/reconcile hooks without embedding provider
   logic in the kernel.
8. Add a reference HTTP command transport and domain-route adapter example.
9. Add static/direct-write detection hooks for host repositories.

### Gate

Every canonical mutation fixture passes through `kernel.execute`; no CLI or reference
engine path contains a second mutation implementation.

## Phase 3 — VFS, identity, authorization, and leases

### Goal

Standardize the storage and security boundaries required by the kernel.

### Work

1. Publish adapter interfaces and contract-test harnesses.
2. Implement and harden the reference filesystem VFS adapter.
3. Standardize verified-principal and authentication-provenance inputs.
4. Implement capability authorization, policy floors, and step-up/human confirmation.
5. Implement in-memory and filesystem idempotency/lease reference stores.
6. Add failure-injection tests for unreadable state, partial effects, stale versions,
   and expired leases.
7. Add external resource and secret-reference adapter examples.

### Gate

At least two implementations of each storage adapter contract produce equivalent
normalized verdicts under the shared suite.

## Phase 4 — Canonical events and projections

### Goal

Standardize immutable change history and every rebuildable read model.

### Work

1. Define the canonical event envelope and reference append-only event store.
2. Implement projection subscriptions, cursors, retries, replay, rebuild, and drift
   comparison.
3. Record actor, scope, action, correlation, causation, idempotency, versions, and
   before/after hashes.
4. Ensure projection failures never rewrite canonical state or committed events.
5. Add SQL, search, queue, and view-model adapter examples.
6. Add failure-injection tests for duplicate events, stale cursors, projection
   failures, replay, rebuild, and direct projection writes.

### Gate

Projections can be deleted and rebuilt from canonical state and events, and direct
projection drift is detected.

## Phase 5 — Multilingual semantic runtime

### Goal

Make language-independent meaning and rendering package-level contracts.

### Work

1. Remove the translation primitive and required localized-tree workflow from the
   0.9 registry, spec, CLI, fixtures, bundle, and help.
2. Define canonical semantic records and privacy filters.
3. Publish a multilingual embedding adapter and record model/dimension provenance.
4. Implement hybrid retrieval with explicit lexical and semantic evidence.
5. Publish the runtime render adapter with invariant symbolic controls.
6. Prove that a primitive authored in one language is found and rendered in another
   without stored translations.

### Gate

Cross-language retrieval and rendering work for a new user-defined primitive while
all symbolic controls and private-data boundaries remain invariant.

## Phase 6 — Generative UI projection

### Goal

Make on-demand UI a secure, disposable projection over authorized SSSS state.

### Work

1. Define the typed UI manifest, component registry, field bindings, action registry,
   accessibility requirements, and deterministic fallback.
2. Implement authorization-aware UI context selection and redaction.
3. Implement UI-manifest validation, complexity limits, safe output encoding, and
   prompt-injection defenses.
4. Prove that every generated action maps to an authorized kernel command.
5. Prove deterministic fallback behavior when planning is unavailable or rejected.

### Gate

Generated UI works for a new user-defined primitive without exposing hidden fields,
granting authority, executing arbitrary code, or bypassing the mutation kernel.

## Phase 7 — CLI, SDK, bundles, migrations, and package release candidate

### Goal

Make the architecture usable and upgradeable without manual schema copying.

### Work

1. Add `ssss primitive create|validate|inspect|migrate` commands.
2. Add `ssss registry compose|lock|verify` commands.
3. Add `ssss conformance adapter` commands and machine-readable reports.
4. Generate TypeScript declarations and optional framework bindings from definitions.
5. Extend bundles with primitive, extension, migration, and integrity
   dependencies.
6. Implement `ssss migrate 0.8-to-0.9` with dry-run, diagnostics, backup, and rollback
   guidance.
7. Publish a local release candidate and validate clean-package installation.
8. Update normative spec, registry schemas, help, examples, security model, and
   package skill only after executable contracts pass.

### Gate

A clean sample repo installs the release candidate, defines a primitive, runs the
kernel, generates a UI projection, bundles the result, and passes conformance
without copying package internals.

## Phase 8A — Total Recall adapter rollout

### Goal

Prove filesystem sovereignty, semantic memory, and compatibility with the reference
kernel.

### Work

1. Inventory Total Recall core copies and host-only extensions.
2. Convert host-only schemas to qualified extension definitions.
3. Wire its VFS, identity, authorization, lease, event, semantic, and projection
   adapters.
4. Run shadow validation against current behavior.
5. Route low-risk primitives, then memory and workflows, through the kernel.
6. Delete copied core registry/schema/fixture behavior after parity.
7. Run clean-account initialization, replay, recovery, and privacy verification.

### Gate

Total Recall passes package and host conformance with no direct canonical mutation
path or maintained core copy.

## Phase 8B — Festech adapter rollout

### Goal

Prove durable idempotency, leases, protected external resources, event routing, and
SQL projections.

### Work

1. Convert product types to namespaced extension definitions.
2. Wire SQL-backed idempotency, lease, event, projection, and resource adapters.
3. Replace local core validation with package validation plus extension declarations.
4. Shadow protected-resource authorization and human-confirmation policies.
5. Route a low-risk family, then resource-bound families, through the kernel.
6. Verify provider prepare/finalize/reconcile and authenticated webhooks.
7. Delete copied core registry/fixtures/operation behavior after parity.
8. Rebuild SQL projections from canonical state/events and compare live results.

### Gate

Festech passes kernel, resource, security, replay, and projection drift suites without
direct product writes bypassing SSSS.

## Phase 8C — UltraChat adapter and generative-UI rollout

### Goal

Prove dynamic definitions, layered scopes, migrations, replay, drift detection, and
production generative UI.

### Work

1. Split current schemas into core consumption and namespaced host extensions.
2. Wire system/account/workspace registry and VFS scope adapters.
3. Replace local core validator/registry/fixture copies.
4. Route schema changes and migrations through primitive-definition commands.
5. Wire event replay, projection rebuild, and drift detection to package contracts.
6. Implement the trusted component/action registry and typed UI renderer.
7. Enable generated UI behind a feature flag with deterministic fallback.
8. Run clean-account, cross-scope isolation, prompt-injection, accessibility, and
   production deployment verification.

### Gate

UltraChat can define a workspace primitive at runtime and safely generate and execute
its UI through the same kernel, with scope isolation and replay proven.

## Phase 9 — Final testing, documentation, and release

### Goal

Prove cross-host equivalence and safely release 0.9.0.

### Work

1. Run the complete reference conformance suite from a clean checkout and package.
2. Run every adapter contract suite in all three hosts.
3. Run a shared cross-host envelope corpus and compare normalized results.
4. Test clean initialization, upgrade, rollback, replay, projection rebuild, event
   recovery, direct-write detection, and external-resource reconciliation.
5. Run adversarial security, path, symlink, collision, authorization, lease, privacy,
   UI, and prompt-injection tests.
6. Verify multilingual primitive creation, retrieval, rendering, and UI without
   translation artifacts.
7. Verify package contents, provenance, SBOM/audit results, changelog, and migration
   documentation.
8. Publish 0.9.0, verify a clean npm install, and only then deprecate 0.8.0 if policy
   approved in Phase 0.
9. Update repo-expert, SSSS skills, downstream architecture docs, handoffs, and
   trackers from verified implementation evidence.
10. Move this project to `completed/` only after every final tracker item is checked;
    preserve any deferrals in `docs/projects/DEFERRED_BACKLOG.md`.

### Gate

All final tracker items are checked with recorded evidence. Package publication alone
does not satisfy this gate.

## Sequencing Rationale

- Registry and kernel semantics precede adapters so hosts cannot define the standard
  accidentally.
- Security, VFS integrity, leases, and events precede UI and convenience tooling.
- Multilingual semantics precede UI so language behavior has one source.
- Total Recall proves the simplest canonical filesystem path first.
- Festech proves external resources and durable projections second.
- UltraChat proves the broadest dynamic and UI behavior after the kernel stabilizes.
- Release is last because 0.8.0 already demonstrates the cost of publishing before
  downstream architecture is reconciled.
