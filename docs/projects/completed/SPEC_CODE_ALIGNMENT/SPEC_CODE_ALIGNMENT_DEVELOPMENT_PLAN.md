---
type: project_document
title: SPEC_CODE_ALIGNMENT — Development Plan
tags: ["project-management", "SPEC_CODE_ALIGNMENT"]
timestamp: 2026-09-24T00:00:00Z
---

# SPEC_CODE_ALIGNMENT — Development Plan

> **Project Prefix**: `SPEC_CODE_ALIGNMENT`
> **Kanban State**: ✅ Completed
> **Author**: Claude (Opus 5.5) with Greg Iteen
> **Date**: 2026-09-24

---

## Phase 1 — Kernel fixes (A1, A2, A3)
- Error codes on every `failure()` path; `unauthorized` split from `forbidden`.
- Resource lifecycle: reconcile on dry-run; finalize outside the rollback scope.
- `http.mjs`: `ERROR_STATUS`, `statusForResponse`; `kernel.d.ts` updated.

## Phase 2 — Conformance (A4, A5, R4)
- Correct fixtures 007/011/018 `expected_http_status`; runner enforces status in-process.
- Resource-lifecycle checks in `conformance-09.mjs`.
- `scripts/audit-spec-examples.mjs` wired into `npm test`.

## Phase 3 — Spec revision (B1–B25)
- Rewrite §2, §4.2–4.4, §5.3–5.4 examples, §6 (envelope, stages, idempotency, response, errors), §7, §8.2, §9, §10.1, §11.7, §12, §13, §16.2–16.3, §17.4, Appendix A.
- New §4.5 frontmatter subset and §6.6 adapter contracts.

## Phase 4 — Close-out
- CHANGELOG `[Unreleased]`, full `npm test`, move project to `completed/`.
