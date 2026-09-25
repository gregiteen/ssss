---
type: project_document
title: SPEC_CODE_ALIGNMENT — PRD
tags: ["project-management", "SPEC_CODE_ALIGNMENT"]
timestamp: 2026-09-24T00:00:00Z
---

# SPEC_CODE_ALIGNMENT — PRD

> **Project Prefix**: `SPEC_CODE_ALIGNMENT`
> **Kanban State**: ✅ Completed
> **Author**: Claude (Opus 5.5) with Greg Iteen
> **Date**: 2026-09-24

---

## Problem

The spec calls itself "the ground truth on which all SSSS implementations are
built", but a second implementer following it today would build the pre-0.9
role-based engine, write example documents that the reference validator
rejects, and return HTTP statuses that the reference transport contradicts. See
the [audit](SPEC_CODE_ALIGNMENT_AUDIT.md).

## Goals

1. Fix the reference kernel's resource-hook bugs (A1, A2) and give every kernel
   failure a stable symbolic error code (A3).
2. Make the fixtures and the reference HTTP adapter agree with the spec's error
   table, and have the in-process runner enforce `expected_http_status` (A4).
3. Rewrite the drifted sections of the spec so they describe the 0.9 kernel
   exactly (B1–B25).
4. Add a conformance gate: every example document in the spec validates, and
   every contract field the spec names exists in the code. This keeps the spec
   from drifting again.

## Non-goals

- No wire-format breaking change. All kernel changes are additive (a new
  `error` member on failure responses) or bug fixes.
- No spec version bump. It stays **v0.9**, as an editorial and clarifying
  revision. The package moves to 0.9.4 only if the user asks for a release.
- No publishing or pushing without the push skill and the user's go-ahead.

## Requirements

- R1: A `finalize` failure after the event append MUST NOT roll back the
  canonical commit. It calls `reconcile` and surfaces a warning.
- R2: Every successful `prepare` is followed by exactly one `finalize` or
  `reconcile`, including on `dry_run` and on commit failure.
- R3: Failure responses carry `error: { code, message }` using the symbolic
  codes from the fixture error table. `src/http.mjs` maps codes to statuses
  without searching message text.
- R4: `npm test` fails if any spec example fails validation.
- R5: The existing suite stays green, with new checks for R1–R4.
