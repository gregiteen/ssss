---
type: project_document
title: FILE_ADAPTER_CONCURRENCY_HARDENING — Development Plan
tags: ["project-management", "FILE_ADAPTER_CONCURRENCY_HARDENING"]
timestamp: 2026-09-25T03:21:52Z
---

# FILE_ADAPTER_CONCURRENCY_HARDENING — Development Plan

> **Project Prefix**: `FILE_ADAPTER_CONCURRENCY_HARDENING`
> **Kanban State**: 🏗️ In Progress
> **Author**: Claude (Opus 5.5) with Greg Iteen
> **Date**: 2026-09-24

---

## Phase 1 — Event-id index (0.9.1)

Per-instance event-id index with stat revalidation; conformance checks for
duplicates across instances/processes, one read per batch, replay order, mode,
symlink refusal. Released as 0.9.1.

## Phase 2 — Shared cross-process lock

Add `src/file-lock.mjs`; route the four adapters' check-then-write sections
through it; reserve `.ssss-locks/` in `FileSystemVfs`.

## Phase 3 — Multi-process conformance

For each adapter, spawn N child processes that start on a shared deadline and
race the same operation; assert exactly one success and a consistent final
state. Add lock checks: dead-holder break, stale-by-age break, live-lock
timeout, symlinked-lock refusal, reserved VFS path, `list()` hides locks.
Confirm the race checks fail against the pre-lock adapters.

## Phase 4 — Release hygiene

Fix `release.sh`; update the push skill to publish from a clean clone of the
tag; create `v0.8.0`/`v0.9.0` from the published tarballs.

## Phase 5 — Release and downstream

Release 0.9.2 via the push skill; bump Dabber CRM and run its SSSS test.

## Phase 6 — Kernel same-key dedupe (0.9.3)

Key-derived `event_id` for `event` envelopes; winner replay after a lost
commit; multi-process kernel race checks; release 0.9.3; Dabber `/push`.

## Phase 7 — Verification

`npm test`, `npm run conformance`, push-skill preflight, Dabber-shaped benchmark,
Dabber `test:ssss` against the published package.
