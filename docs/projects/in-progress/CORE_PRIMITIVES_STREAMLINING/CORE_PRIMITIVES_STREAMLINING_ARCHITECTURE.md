---
type: project_document
title: CORE_PRIMITIVES_STREAMLINING — Architecture
tags: ["project-management", "CORE_PRIMITIVES_STREAMLINING"]
timestamp: 2026-09-28T09:33:00Z
---

# CORE_PRIMITIVES_STREAMLINING — Architecture

> **Project Prefix**: `CORE_PRIMITIVES_STREAMLINING`  
> **Kanban State**: 🏗️ In Progress  
> **Author**: Greg Iteen & Antigravity  
> **Date**: 2026-09-28  

---

## Architectural Overview

This architecture refines the canonical SSSS Core primitive catalog from a loose collection of 15 primitives into a cohesive, orthogonal set of **13 execution-kernel primitives**.

```
                   SSSS KERNEL PRIMITIVE TOPOLOGY
┌──────────────────────────────────────────────────────────────────┐
│ ACTORS & GOVERNANCE                                              │
│   • assistant   - Agent persona and system role                  │
│   • role        - RBAC capabilities (canonical ROLE.md)          │
│   • rule        - Invariant behavioral policies                  │
├──────────────────────────────────────────────────────────────────┤
│ WORK & EXECUTION                                                 │
│   • workflow    - Pure procedural recipes and step definitions   │
│   • trigger     - Standalone schedules / webhooks (with leases)  │
│   • task        - Active state machine (pending/in_progress/done)│
│   • run         - Append-only execution trace                    │
├──────────────────────────────────────────────────────────────────┤
│ KNOWLEDGE & MESSAGING                                            │
│   • memory      - Ground truth, facts, decisions, preferences    │
│   • thread      - Append-only multi-turn chat transcripts        │
├──────────────────────────────────────────────────────────────────┤
│ CAPABILITIES & INFRASTRUCTURE                                    │
│   • skill       - Portable tool manifests (SKILL.md)             │
│   • asset       - Text/Base64 files & binary pointer records     │
│   • resource    - External cloud bindings (resource_bound)       │
├──────────────────────────────────────────────────────────────────┤
│ META-KERNEL                                                      │
│   • primitive   - Governed definitions of extension types        │
│   • migration   - Schema upgrade records                         │
└──────────────────────────────────────────────────────────────────┘
```

---

## 1. The Two-Tier File Architecture (`asset` + `resource`)

To maintain SSSS's Markdown-first and database-free guarantee without choking LLM context windows or Git repositories on massive binaries, files are partitioned into two tiers:

### Tier 1: Inline Text Assets (`asset`)
For source code (`.js`, `.py`, `.sql`), vector graphics (`.svg`), configs, and small binary images/icons (< 5 MB):
* **Storage**: Inlined directly in the Markdown body via Base64 or UTF-8.
* **Portability**: `structural` (included in export bundles/templates).
* **Mutations**: Fully support `operation` (atomic rewrite) and `patch` envelopes.
* **Schema**:
  ```yaml
  ---
  type: asset
  title: "Brand Favicon"
  name: "favicon-icon"
  slug: favicon-icon
  description: "Primary site favicon"
  timestamp: 2026-09-28T00:00:00Z
  mime_type: "image/png"
  encoding: "base64" # [base64, utf-8, none]
  portability: structural
  ---
  iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==
  ```

### Tier 2: External Pointer Assets (`resource` + `asset`)
For large files (videos, 100MB+ datasets, high-res audio, ML weights):
* **Storage**: Binary bytes stream directly to external object storage (S3, Cloudflare R2, GCS).
* **The Storage Container**: Declared as a `resource` primitive with `kind: s3_bucket` (`portability: resource_bound`).
* **The Pointer Record**: Stored in the vault as an `asset` with `encoding: none`, pointing to `resource_ref`, `storage_uri`, and storing `size_bytes` and SHA-256 `hash`.
* **Export Behavior**: When exporting a `sale` or `template` bundle, private `storage_uri` strings and bucket credentials are stripped, converting the asset into a clean requirement declaration.

---

## 2. Standalone Trigger & Lease Architecture (`trigger`)

Decoupling triggers from `workflow.md` solves distributed scheduling contention:

```
┌──────────────────────────┐          acquires file lease
│  vault/triggers/cron.md  │  ◄───────────────────────────  Worker Daemon 1
└────────────┬─────────────┘
             │ references target_workflow
             ▼
┌──────────────────────────┐
│ vault/workflows/sync.md  │  (Workflow remains unleased, pure, and reusable)
└──────────────────────────┘
```

1. **File-Level Leasing (`src/leases.mjs`)**: Daemons acquire an exclusive lease on `vault/triggers/<id>.md`, preventing concurrent workers from firing duplicate ticks without locking the underlying workflow.
2. **Schema**:
   ```yaml
   ---
   type: trigger
   title: "Nightly Sync"
   name: "nightly-sync"
   slug: nightly-sync
   description: "Fires nightly batch synchronization"
   timestamp: 2026-09-28T00:00:00Z
   status: active # [active, paused, disabled]
   source: cron   # [cron, interval, webhook, event, file_change, condition]
   cron: "0 2 * * *"
   target_workflow: "workflows/sync.md"
   concurrency: skip_if_running
   misfire_policy: run_once
   ---
   ```

---

## 3. The `resource` Primitive Contract

Completes the orphaned `resource_bound` portability class (§5.5) and the Resource Coordinator adapter contract (§6.7):

* **Schema**:
  ```yaml
  ---
  type: resource
  title: "Primary PostgreSQL Database"
  name: "primary-db"
  slug: primary-db
  description: "Application production database"
  timestamp: 2026-09-28T00:00:00Z
  kind: postgres # [postgres, s3_bucket, domain, phone_number, mailbox, api_connection]
  status: bound   # [bound, unbound, pending, error]
  portability: resource_bound
  binds:
    host: "db.internal.net"
    port: 5432
    database: "app_prod"
  provisioning:
    required: true
    prompt: "Provide PostgreSQL 15+ connection parameters"
  ---
  ```
* **Bundle Export Mechanics (`src/bundle.mjs`)**:
  When exported under the `sale` or `template` profile, the engine invokes `reduceResourceBoundFile()`, which scrubs the `binds` payload and copies the `provisioning` declaration into the `.ucw` manifest.

---

## 4. Aliasing & Backward Compatibility

To maintain zero breaking changes across existing hosts, fixtures, and tools:
1. `registry/core.json` declares `role` as the canonical document primitive, with alias `security_role`.
2. `registry/core.json` declares `thread` as the canonical document primitive, with alias `conversation`.
3. In `src/registry.mjs`, alias resolution continues to resolve both qualified (`ssss:role`, `ssss:security_role`) and bare forms (`role`, `security_role`) to the same canonical type definition.
4. Existing primitives `release`, `model`, `page`, and `conflict` are retained in `registry/core.json` during the 0.9.x lifecycle as deprecated/legacy to prevent breaking existing conformance assertions.

---

## 5. Workspace Scaffolding Update (`scripts/cmd-new.mjs`)

`ssss new <dir>` is updated to write:
* `docs/design.md`: A structured architecture and design template.
* Updated `CLAUDE.md` and `README.md` referencing the updated core primitives.
