---
type: project_document
title: CORE_PRIMITIVES_STREAMLINING — Product Requirements
tags: ["project-management", "CORE_PRIMITIVES_STREAMLINING"]
timestamp: 2026-09-28T09:33:00Z
---

# CORE_PRIMITIVES_STREAMLINING — Product Requirements

> **Project Prefix**: `CORE_PRIMITIVES_STREAMLINING`  
> **Kanban State**: 🏗️ In Progress  
> **Author**: Greg Iteen & Antigravity  
> **Date**: 2026-09-28  

---

## Problem

The current SSSS 0.9 core primitive registry (`registry/core.json`) exhibits several architectural gaps, naming redundancies, and dead weight:

1. **Missing External Binding Primitive**: While the spec defines the `resource_bound` portability class (§5.5) and the Resource Coordinator adapter contract (§6.7), there is no canonical `resource` core primitive to represent external databases, API connections, domains, and mailboxes.
2. **Missing Text-Encoded File/Asset Primitive**: Applications require a structured way to handle small assets (icons, SVGs, code files) embedded directly into the Markdown VFS via Base64 or UTF-8, and to track large binary assets (videos, large datasets) via pointer metadata linking to external storage resources.
3. **Trigger Coupling**: Workflows currently embed triggers directly inside `workflow.md`, which couples procedural logic to operational schedules and forces distributed schedulers to lock entire workflow files rather than leasing lightweight schedule records.
4. **Naming Mismatches**:
   - `security_role` lives in `roles/<role>/ROLE.md` and checks `actor.role`, yet uses the verbose type discriminator `security_role`.
   - `conversation` requires `thread_id` and models multi-turn message turns, yet uses `type: conversation` instead of the industry-standard `thread`.
5. **Inert Core Primitives**: Types such as `release` (already tracked by git/package.json/bundle manifests) and `model` (static metadata never consumed by runtime engines) add maintenance and conformance overhead without providing active engine mechanics. `page` and `conflict` are tied to specific web UIs or memory layers rather than the core execution kernel.
6. **Starter Workspace Guidance**: New projects scaffolded via `ssss new` lack a default `design.md` template to capture system architecture and technical specifications.

## Scope

### In Scope
1. **Core Registry Additions**:
   - Add `asset` primitive for text/base64-encoded files and large-asset pointer records.
   - Add `resource` primitive for external cloud/infrastructure bindings (`resource_bound` class).
   - Add `trigger` primitive for standalone event/cron schedules.
2. **Core Registry Name Streamlining & Backward Compatibility**:
   - Alias `role` with `security_role`.
   - Alias `thread` with `conversation`.
3. **Core Registry Pruning / Deprecation**:
   - Mark `release` and `model` as deprecated or demote them out of core.
   - Demote `page` to a UI extension (`ui:page`) and `conflict` to the Total Recall memory extension.
4. **Specification Parity**:
   - Update `docs/ssss-spec.md` (§5.1, §5.4) with normative schemas and valid examples for all new/updated primitives.
   - Pass `scripts/audit-spec-examples.mjs`.
5. **Workspace Scaffolding**:
   - Update `scripts/cmd-new.mjs` to scaffold `docs/design.md`.
6. **Full Conformance & Quality Verification**:
   - All kernel, adapter, bundle, and CLI smoke conformance checks pass.

### Out of Scope
- Modifying third-party hosts (`ultrachat`, `festech-modular`) directly in this repo.
- Modifying binary storage backend adapters beyond the reference VFS.

## Requirements

| ID | Requirement | Success Criteria |
| :--- | :--- | :--- |
| **R1** | Define `asset` primitive | `registry/core.json` declares `asset` (`family: capability`, `portability: structural`, required fields `["type", "name", "mime_type", "encoding"]`). |
| **R2** | Define `resource` primitive | `registry/core.json` declares `resource` (`family: capability`, `portability: resource_bound`, required fields `["type", "name", "kind", "status"]`). |
| **R3** | Define `trigger` primitive | `registry/core.json` declares `trigger` (`family: work`, `portability: structural`, required fields `["type", "name", "source", "status"]`). |
| **R4** | Streamline `role` and `thread` | Core aliases `role` ↔ `security_role` and `thread` ↔ `conversation` without breaking existing fixtures or vaults. |
| **R5** | Deprecate or demote inert primitives | `release`, `model`, `page`, and `conflict` are cleanly decoupled from the mandatory kernel core. |
| **R6** | Update `docs/ssss-spec.md` | §5.1 table and §5.4 per-type schemas document the new primitives with validated markdown examples. |
| **R7** | Scaffold `docs/design.md` | Running `ssss new <dir>` produces `docs/design.md` alongside `README.md` and `CLAUDE.md`. |
| **R8** | Conformance Gates | `npm test` and `scripts/audit-spec-examples.mjs` pass cleanly with 100% green status. |

## Priority

- **Severity Tier**: P1 (Standard/Spec & Registry Alignment).
