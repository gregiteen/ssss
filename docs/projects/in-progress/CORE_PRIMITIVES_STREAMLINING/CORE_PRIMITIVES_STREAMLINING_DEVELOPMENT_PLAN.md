---
type: project_document
title: CORE_PRIMITIVES_STREAMLINING — Development Plan
tags: ["project-management", "CORE_PRIMITIVES_STREAMLINING"]
timestamp: 2026-09-28T09:33:00Z
---

# CORE_PRIMITIVES_STREAMLINING — Development Plan

> **Project Prefix**: `CORE_PRIMITIVES_STREAMLINING`  
> **Kanban State**: 🏗️ In Progress  
> **Author**: Greg Iteen & Antigravity  
> **Date**: 2026-09-28  

---

## Phase 1: Core Registry Updates (`registry/core.json`)

- [ ] **Task 1.1**: Define the `asset` primitive in `registry/core.json` (`family: capability`, `portability: structural`, required fields: `type`, `name`, `mime_type`, `encoding`).
- [ ] **Task 1.2**: Define the `resource` primitive in `registry/core.json` (`family: capability`, `portability: resource_bound`, required fields: `type`, `name`, `kind`, `status`).
- [ ] **Task 1.3**: Define the `trigger` primitive in `registry/core.json` (`family: work`, `portability: structural`, required fields: `type`, `name`, `source`, `status`).
- [ ] **Task 1.4**: Configure non-breaking aliases in `registry/core.json` (or verify alias engine support) for `role` ↔ `security_role` and `thread` ↔ `conversation`.

---

## Phase 2: Specification Parity & Schema Documentation (`docs/ssss-spec.md`)

- [ ] **Task 2.1**: Update §5.1 Document Primitives table in `docs/ssss-spec.md` to list `asset`, `resource`, and `trigger` with their normative portability classes.
- [ ] **Task 2.2**: Add §5.4 per-type schema documentation and minimal valid markdown examples for `asset`, `resource`, and `trigger`.
- [ ] **Task 2.3**: Document the `role` and `thread` naming convention and their alias relationships.
- [ ] **Task 2.4**: Run `node scripts/audit-spec-examples.mjs` and ensure all spec markdown examples pass reference validation.

---

## Phase 3: Workspace Scaffolding Update (`scripts/cmd-new.mjs`)

- [ ] **Task 3.1**: Update `scripts/cmd-new.mjs` to scaffold `docs/design.md` for newly generated repos (`ssss new <dir>`).
- [ ] **Task 3.2**: Update `docs/help/scaffold.md` to document the new `docs/design.md` template.
- [ ] **Task 3.3**: Verify `ssss new` smoke test passes with the updated layout.

---

## Phase 4: Quality Gate & Conformance Verification

- [ ] **Task 4.1**: Run `node ./scripts/conformance.mjs conformance --engine` to verify 100% pass rate across kernel, adapter, bundle, and CLI smoke checks.
- [ ] **Task 4.2**: Run `node skills/ssss-project-management/scripts/check-project-docs.mjs CORE_PRIMITIVES_STREAMLINING` to ensure all SWE sequence requirements are met.
- [ ] **Task 4.3**: Update project tracker and prepare for completion.
