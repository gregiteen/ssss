---
type: project_document
title: SSSS_0_9_0_SEMANTIC_APPLICATION_KERNEL — Product Requirements
tags: ["project-management", "SSSS_0_9_0_SEMANTIC_APPLICATION_KERNEL"]
timestamp: 2026-07-10T00:00:00Z
---

# SSSS_0_9_0_SEMANTIC_APPLICATION_KERNEL — Product Requirements

> **Project Prefix**: `SSSS_0_9_0_SEMANTIC_APPLICATION_KERNEL`
> **Kanban State**: 🏗️ In Progress
> **Author**: Greg Iteen and Codex
> **Date**: 2026-07-10

---

> **Target Release:** `@gregiteen/ssss-cli@0.9.0`  
> **Project Type:** Breaking pre-1.0 kernel standardization  

## 0. Executive Summary

SSSS 0.9.0 turns the current Markdown format, registry, reference engine, and CLI
into one semantic application kernel. Any repository, installed extension,
workspace, or authorized user can define primitives, but every definition executes
through the same validation, mutation, VFS,
authorization, lease, event, projection, semantic, and UI contracts.

The release replaces copied host implementations with package-owned behavior and
thin infrastructure adapters. It also corrects the 0.8.0 localization direction:
human-language content may be authored in any language, multilingual retrieval
works across languages, and LLMs render presentation in the requested language at
runtime. SSSS does not require translation documents or manually maintained
localized vault trees.

## 1. Vision

SSSS is the single semantic state and mutation authority beneath applications,
agents, automations, CLIs, APIs, and generated interfaces.

```text
user, agent, automation, or verified external event
  -> SSSS command boundary
  -> canonical VFS state + append-only events
  -> disposable projections
  -> APIs, search, automations, and generative UI
```

Every product may express its own domain. No product may create a competing core
mutation engine.

## 2. Problem Statement

The current ecosystem contains a strong standard scattered across several
implementations:

- the SSSS repository owns the core registry, Operation Contract, reference
  engine, runtime helpers, bundles, provisioning, and conformance;
- Total Recall adds detailed schemas, semantic memory, scoped VFS behavior, and
  validated-write boundaries;
- Festech adds durable idempotency, leases, protected-resource authorization,
  resource-bound primitives, event routing, and SQL projections;
- UltraChat adds dynamic extensions, system/account/workspace composition,
  schema migrations, projection rebuilds, replay, and drift detection.

Hosts currently copy core registries, validators, fixtures, schema knowledge, and
operation behavior. Consequently, a core package upgrade requires manual edits in
multiple repositories and those copies drift from one another.

The 0.8.0 work also introduced persisted translation overlays and localized trees.
That conflicts with the intended semantic model: multilingual LLMs and embedding
models should interpret and render natural-language content directly while stable
symbolic controls remain invariant.

## 3. Product Principles

1. **One kernel, many domains.** Repositories define primitives; SSSS defines how
   they behave.
2. **One mutation authority.** Persistent user-data changes cannot bypass the
   SSSS command boundary.
3. **VFS and events are canonical.** Databases, indexes, queues, dashboards, and
   UI are rebuildable projections.
4. **Language is presentation, not identity.** Natural-language surfaces may use
   any language; identifiers, enum codes, permissions, and paths remain stable.
5. **Extensions never copy core.** Core behavior is consumed from the package.
6. **Security is fail-closed.** Identity is verified by the host, authorization is
   kernel-enforced, leases are checked, and events are immutable.
7. **Generated UI is constrained.** LLMs compose validated manifests from trusted
   components and actions; they do not receive authority to execute arbitrary code.
8. **No hidden canonical database.** External stores may persist resources or
   projections, but SSSS state and events remain the semantic record.
9. **Conformance is executable.** Claims are proven against the same package-owned
    fixtures and adapter contract suites.

## 4. Users and Jobs

### Repository maintainers

- Define domain primitives without forking SSSS.
- Upgrade SSSS by changing the dependency and satisfying adapter conformance,
  rather than copying schemas and fixtures.

### Application developers

- Route all mutations through one stable API.
- Generate CRUD, workflows, automations, and UI from primitive definitions.
- Use SQL, object storage, or external services without changing SSSS semantics.

### End users

- Describe new primitives in any language.
- Receive interfaces and explanations in their requested language.
- Trust that all mutations are authorized, auditable, replayable, and recoverable.

### Agent and tool authors

- Execute only declared, capability-bound actions.
- Inspect schemas and produce dry-run envelopes before mutation.

### Extension publishers

- Package versioned namespaced primitives, actions, projection declarations,
  and migrations without central approval.
- Publish extensions to any registry while retaining portable dependency metadata.

## 5. Functional Requirements

### 5.1 Primitive definition and composition

- SSSS MUST define a meta-primitive for versioned primitive definitions.
- Core, extension, repo, workspace, and user definitions MUST compose into one
  effective registry without silent overrides.
- Canonical primitive identity MUST be namespaced and stable.
- Human-facing names, descriptions, field labels, help, and examples MAY be
  authored in any language.
- Field IDs, action IDs, enum codes, capability IDs, paths, and versions MUST be
  stable symbolic values; SSSS MAY generate them from natural-language input.
- Definitions MUST declare schema constraints, mutation mode, portability, scopes,
  references, authorization capabilities, events, and projections.
- Breaking definition changes MUST require a new version and explicit migration.

### 5.2 Single mutation boundary

- All canonical user-data mutations MUST enter the same kernel command boundary.
- The kernel MUST support create/replace, patch, append/event, and delete semantics.
- Domain-friendly endpoints MAY exist but MUST only construct verified SSSS
  envelopes and invoke the kernel.
- Direct writes to canonical VFS state or authoritative external-resource metadata
  MUST be detectable and prohibited.
- Dry runs MUST produce the same validation and authorization verdict as commits,
  excluding the final side effects.

### 5.3 VFS contract

- SSSS MUST publish one adapter contract for read, list, stat, atomic write,
  compare-and-swap, append, and delete operations.
- Containment, path normalization, symlink refusal, append-only behavior, and
  atomicity MUST be kernel invariants.
- Local filesystem, sandbox, object-store, and database-backed adapters MUST pass
  the same contract suite.
- Raw binaries MAY live outside the Markdown VFS; ownership, hash, reference,
  lifecycle, and audit metadata MUST remain SSSS-managed.

### 5.4 Identity and authorization

- Caller-supplied identity MUST never be trusted.
- Hosts MUST inject a verified principal with scope and authentication provenance.
- Primitive definitions MUST declare required capabilities by action.
- Authorization MUST run inside the kernel and fail closed.
- Protected financial, infrastructure, secret, and account operations MUST support
  stronger policy and human-confirmation requirements.

### 5.5 Idempotency and leases

- Request identity MUST cover workspace, idempotency key, and canonical request
  hash.
- Exact retries MUST replay; key reuse with a changed request MUST conflict.
- Lease ownership, scope, operation binding, renewal, expiry, and release MUST be
  standardized.
- Missing, malformed, mismatched, expired, or unreadable required lease state MUST
  fail closed.
- In-memory and durable stores MUST satisfy the same semantics.

### 5.6 Events and projections

- Successful mutations MUST append one canonical immutable event before projection
  dispatch is considered successful.
- Events MUST identify actor, action, subject, scope, correlation, causation,
  idempotency, schema version, and before/after hashes where applicable.
- Projection declarations MUST be part of primitive or extension metadata.
- Projection workers MUST be replayable, idempotent, cursor-aware, rebuildable, and
  drift-detectable.
- Projection failure MUST not rewrite or invalidate a committed canonical event.

### 5.7 Semantic and multilingual behavior

- Any natural-language field or body MAY be authored in any language.
- SSSS MUST standardize one multilingual embedding adapter contract and record
  model identity and dimensions in derived indexes.
- Cross-language retrieval MUST use semantic evidence; lexical-only matching MUST
  not be represented as multilingual semantic retrieval.
- Requested output language MUST be a runtime rendering parameter.
- Rendering MUST be ephemeral and limited to natural-language presentation fields.
- SSSS MUST NOT require translation primitives, translation files, or localized
  canonical vault copies.
- Private and resource-bound content MUST be excluded from semantic and UI planning
  unless explicitly authorized.

### 5.8 Generative UI

- UI MUST be treated as a disposable projection and command client.
- SSSS MUST define a typed UI-manifest schema, component registry, action registry,
  data bindings, accessibility requirements, and deterministic fallback behavior.
- LLM planners MAY choose layout, components, explanations, and language.
- Generated manifests MUST use allowlisted components and actions and MUST pass
  schema and authorization-aware validation before rendering.
- UI actions MUST map to SSSS envelopes; generated UI MUST never write state
  directly or embed trusted actor identity.
- Ephemeral visual state MAY remain client-local; persisted preferences and saved
  layouts MUST use primitives.

### 5.9 External resources and bundles

- Domains, phone numbers, payments, credentials, model providers, and other external
  systems MUST use resource adapters coordinated by the kernel.
- Secret bytes MUST remain in an approved secret store; SSSS records only protected
  references and audit events.
- Verified webhooks MUST enter as SSSS events or reconciliation commands.
- Bundles MUST declare core, extension, and migration dependencies by
  namespace, version range, and integrity hash.
- Import MUST preflight the complete mutation plan before the first commit.

## 6. Non-Goals

- Maintaining a central authoritative list of every product primitive.
- Requiring central approval before a repo or user can define a namespace.
- Mandating one database, web framework, identity provider, model provider, or UI
  framework.
- Making an LLM the validator, authorization engine, or mutation authority.
- Generating and executing arbitrary frontend JavaScript as trusted application code.
- Translating symbolic control fields or persisting manual language variants.
- Standardizing repo-specific skill authoring, discovery, or host projections; that
  is a separate project unless later shown to be required by the kernel.
- Migrating all three downstream products in one unreviewable change.
- Declaring 1.0 stability before cross-host compatibility and recovery are proven.

## 7. Success Criteria

- A user can describe a primitive in a non-English language and receive a valid,
  namespaced, versioned definition without manually writing machine identifiers.
- The new primitive can be created, patched, appended to where applicable, deleted,
  authorized, leased, evented, projected, bundled, and rendered without modifying
  SSSS core code.
- Total Recall, Festech, and UltraChat consume the same core registry, validator,
  Operation Contract, errors, fixtures, and adapter interfaces.
- No downstream repository retains an independently maintained copy of the core
  registry, spec, or conformance fixtures.
- The same conformance envelope produces the same semantic verdict across the
  reference filesystem adapter and all three host adapters.
- Canonical state and projections can be rebuilt from a clean workspace plus event
  history without data loss or unauthorized disclosure.
- Generated UI can safely display and mutate a newly defined primitive using only
  registered components, actions, and the SSSS command boundary.
- Cross-language semantic retrieval and runtime rendering pass tests without stored
  translation documents.
- Direct canonical writes outside the kernel are blocked or detected by automated
  repository checks.
- `0.9.0` ships with an automated migration path and `0.8.0` is marked transitional
  or deprecated only after downstream validation succeeds.

## 8. Primary Risks

- **Kernel overreach:** adapters could become too broad and recreate host logic.
  Contract suites must distinguish infrastructure from semantics.
- **Dynamic-schema abuse:** user-defined primitives could weaken authorization or
  access private data. Definition changes require capability checks and policy floors.
- **Event/projection inconsistency:** external side effects can succeed while local
  commits fail. Resource operations need explicit prepare/commit/reconcile states.
- **Generated UI injection:** manifests, labels, or retrieved instructions may contain
  hostile content. Treat all generated and imported content as untrusted data.
- **Namespace squatting and collision:** qualified IDs, integrity locks, and explicit
  dependency resolution are required.
- **Migration blast radius:** 0.8.0 is already published and hosts contain local WIP.
  Reconciliation must preserve unrelated work and provide reversible adapters.
- **Semantic privacy leakage:** embedding, rendering, and UI planners must apply the
  same authorization and portability filters as reads.

## 9. Release Boundary

SSSS 0.9.0 is complete only when the reference package and three host adapters pass
the final tracker phase. Documentation or package tests alone are insufficient.
The release is pre-1.0 and may break 0.8 contracts, but it MUST provide explicit
migration diagnostics and MUST NOT silently reinterpret existing user data.
