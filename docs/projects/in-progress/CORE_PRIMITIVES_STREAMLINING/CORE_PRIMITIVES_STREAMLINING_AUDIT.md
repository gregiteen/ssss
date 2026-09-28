---
type: project_document
title: CORE_PRIMITIVES_STREAMLINING — Audit
tags: ["project-management", "CORE_PRIMITIVES_STREAMLINING"]
timestamp: 2026-09-28T09:35:00Z
---

# CORE_PRIMITIVES_STREAMLINING — Audit

> **Project Prefix**: `CORE_PRIMITIVES_STREAMLINING`  
> **Kanban State**: 🏗️ In Progress  
> **Author**: Greg Iteen & Antigravity  
> **Date**: 2026-09-28  

---

## Why This Project Exists

SSSS 0.9.x establishes the reference Operation Contract, VFS, and bundle export pipeline. However, practical application development has exposed critical gaps in the core primitive registry (`registry/core.json`), naming friction, and dead-weight primitives.

This audit checks the exact code state of `registry/core.json`, `src/engine.mjs`, `src/bundle.mjs`, and `docs/ssss-spec.md` as of v0.9.7.

---

## Verified Defects & Structural Gaps

| # | Evidence | Impact |
| :--- | :--- | :--- |
| **D1** | **Orphaned `resource_bound` Portability Class**: Spec §5.5 and `src/bundle.mjs` define `resource_bound` export stripping (`reduceResourceBoundFile()`), but `registry/core.json` declares **zero** core primitives with `portability: resource_bound`. | Builders have no standard primitive for external databases, S3 buckets, domains, or mailboxes without inventing custom extension namespaces. |
| **D2** | **No Native Text Asset Primitive**: There is no primitive to store text-encoded files (Base64 icons/small binaries or UTF-8 code/SVGs) in the Markdown VFS. | Small assets and source files must either be left outside the Operation Contract or wrapped in ad-hoc non-standard schemas. |
| **D3** | **Scheduler Lock Contention from Embedded Triggers**: Spec §5.4 embeds `triggers: [...]` inside `workflow.md`. Because SSSS file-locking (`src/leases.mjs`) operates at the file level, daemons coordinating a cron execution must acquire exclusive leases on the entire workflow file. | Workflows cannot remain pure, reusable procedures; concurrent runners risk lease contention on the workflow file itself. |
| **D4** | **Naming Disconnect on RBAC Roles**: Stage 5.5 in `src/engine.mjs` checks `actor.role`. Canonical storage is `roles/<role>/ROLE.md`. Yet `registry/core.json` requires `type: security_role`. | Unnecessary verbosity and impedance mismatch between the file path, the engine identity check, and the document frontmatter. |
| **D5** | **Naming Disconnect on Chat Threads**: In `registry/core.json`, `conversation` requires `thread_id`. Standard messaging protocols and APIs (OpenAI, Slack) standardize on `thread`. | Awkward schema mismatch where `type: conversation` requires `thread_id`. |
| **D6** | **Inert Core Primitives**: Code search across `src/` reveals `release` and `model` are never queried, verified, or consumed by the reference engine runtime. `page` is hardcoded to browser iframe sandbox assumptions (`sandbox_entry: index.html`). | Dead-weight schema bloat in `registry/core.json` that expands conformance fixture maintenance without operational value. |
| **D7** | **Scaffolding Gaps**: `scripts/cmd-new.mjs` (`ssss new`) scaffolds `rules/`, `workflows/`, `assistants/`, and `tasks/`, but provides no `docs/design.md` template for system architecture and interface contracts. | Developers and agents lack a dedicated, immediate place to record architectural design decisions. |

---

## Spec vs. Code Parity Status

* `node scripts/audit-registry-field-usage.mjs` passes (all enforcement-relevant fields in `registry/core.json` are referenced in `src/engine.mjs`).
* `node scripts/audit-spec-examples.mjs` enforces that every core primitive in `registry/core.json` must be listed in §5.1 and have at least one valid, fully-formed example in §5.4.
* Any changes to `registry/core.json` must be simultaneously accompanied by updates to `docs/ssss-spec.md` to avoid failing the spec parity audit.

---

## What Works and Can Be Reused

1. **Portability Engine (`src/bundle.mjs`)**: The `reduceResourceBoundFile()` logic and `resource.binds` stripping already exist and work correctly; adding `resource` to core immediately connects to this existing engine pipeline.
2. **File Lease Store (`src/leases.mjs`)**: File-level leasing is fully implemented and tested; creating `vault/triggers/*.md` leverages this directly.
3. **Alias Engine (`src/registry.mjs`)**: `resolvePrimitiveDefinition()` already resolves aliases seamlessly, allowing `role` and `thread` to be introduced without breaking existing `security_role` and `conversation` fixtures.
