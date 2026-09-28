---
type: project_document
title: CORE_PRIMITIVES_STREAMLINING — Project Tracker
tags: ["project-management", "CORE_PRIMITIVES_STREAMLINING"]
timestamp: 2026-09-28T09:44:00Z
---

# CORE_PRIMITIVES_STREAMLINING — Project Tracker

> **Project Prefix**: `CORE_PRIMITIVES_STREAMLINING`  
> **Kanban State**: 🏗️ In Progress  
> **Author**: Greg Iteen & Antigravity  
> **Date**: 2026-09-28  

---

## Tasks

### Phase 1: Core Registry Updates (`registry/core.json`)
- [x] **Task 1.1**: Define the `asset` primitive in `registry/core.json` (`family: capability`, `portability: structural`, required fields: `type`, `name`, `mime_type`, `encoding`).
- [x] **Task 1.2**: Define the `resource` primitive in `registry/core.json` (`family: capability`, `portability: resource_bound`, required fields: `type`, `name`, `kind`, `status`, `resource.binds`).
- [x] **Task 1.3**: Define the `trigger` primitive in `registry/core.json` (`family: work`, `portability: structural`, required fields: `type`, `name`, `source`, `status`).
- [x] **Task 1.4**: Configure non-breaking primitive support for `role` (alongside `security_role`) and `thread` (alongside `conversation`).

### Phase 2: Specification Parity & Schema Documentation (`docs/ssss-spec.md`)
- [x] **Task 2.1**: Update §5.1 Document Primitives table in `docs/ssss-spec.md` with `asset`, `resource`, `trigger`, `role`, and `thread`.
- [x] **Task 2.2**: Add §5.4 per-type schema documentation and minimal valid markdown examples for `asset`, `resource`, `trigger`, `role`, and `thread`.
- [x] **Task 2.3**: Document `role` (canonical for `security_role`) and `thread` (canonical for `conversation`).
- [x] **Task 2.4**: Run `node scripts/audit-spec-examples.mjs` and ensure all spec markdown examples pass reference validation.

### Phase 3: Workspace Scaffolding Update (`scripts/cmd-new.mjs`)
- [x] **Task 3.1**: Update `scripts/cmd-new.mjs` to scaffold `docs/design.md` for newly generated repos (`ssss new <dir>`).
- [x] **Task 3.2**: Update `docs/help/scaffold.md` to document the new `docs/design.md` template.
- [x] **Task 3.3**: Verify `ssss new` smoke test passes with the updated layout.

### Phase 4: Quality Gate & Conformance Verification
- [x] **Task 4.1**: Run `node ./scripts/conformance.mjs conformance --engine` to verify 100% pass rate.
- [x] **Task 4.2**: Run `node skills/ssss-project-management/scripts/check-project-docs.mjs CORE_PRIMITIVES_STREAMLINING`.
- [x] **Task 4.3**: Complete project review and prepare for release / multi-repo skill fan-out.

---

## Verification Log

- **2026-09-28T09:35:00Z**: Scaffolded complete 5-document SWE sequence under `docs/projects/in-progress/CORE_PRIMITIVES_STREAMLINING/` (`AUDIT`, `PRD`, `ARCHITECTURE`, `DEVELOPMENT_PLAN`, `PROJECT_TRACKER`).
- **2026-09-28T09:37:00Z**: Updated `scaffold-project.mjs` to include `AUDIT` in canonical `DOC_TYPES`, bringing local overlay into sync with global standards.
- **2026-09-28T09:38:00Z**: Completed Task 1.1 (`asset` primitive declared in `registry/core.json`).
- **2026-09-28T09:41:00Z**: Completed Tasks 1.2–1.4 (`resource`, `trigger`, `role`, and `thread` declared in `registry/core.json`).
- **2026-09-28T09:42:30Z**: Completed Tasks 2.1–2.4 (`docs/ssss-spec.md` updated with §5.1 table and §5.4 per-type schemas + valid examples; `scripts/audit-spec-examples.mjs` PASS).
- **2026-09-28T09:43:20Z**: Completed Tasks 3.1–3.3 (`docs/design.md` scaffolded in `scripts/cmd-new.mjs` and documented in `docs/help/scaffold.md`).
- **2026-09-28T09:43:45Z**: Completed Task 4.1 (`node ./scripts/conformance.mjs conformance --engine` PASS with 100/100 kernel, 14/14 bundle, and 9/9 CLI smoke checks green).
- **2026-09-28T09:44:00Z**: Completed Task 4.2 (`check-project-docs.mjs` verifies project document structure is complete).
