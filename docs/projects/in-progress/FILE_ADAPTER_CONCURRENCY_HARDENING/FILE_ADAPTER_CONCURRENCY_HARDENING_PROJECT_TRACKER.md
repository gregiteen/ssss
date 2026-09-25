---
type: project_document
title: FILE_ADAPTER_CONCURRENCY_HARDENING — Project Tracker
tags: ["project-management", "FILE_ADAPTER_CONCURRENCY_HARDENING"]
timestamp: 2026-09-25T03:21:52Z
---

# FILE_ADAPTER_CONCURRENCY_HARDENING — Project Tracker

> **Project Prefix**: `FILE_ADAPTER_CONCURRENCY_HARDENING`
> **Kanban State**: 🏗️ In Progress
> **Author**: Claude (Opus 5.5) with Greg Iteen
> **Date**: 2026-09-24

---

## ✅ Phase 1: Event-id index (0.9.1)

Goal: appends stop re-reading the whole log.

- [x] Per-instance event-id index with stat revalidation in [events.mjs](../../../../src/events.mjs)
- [x] `MemoryEventStore` duplicate check uses a Set
- [x] Conformance: own/other-instance/other-process duplicates, one read per batch, rebuild after foreign append, replay order, 0600, symlink refusal
- [x] Released 0.9.1 (tag `v0.9.1`, npm `latest`)

## ✅ Phase 2: Shared cross-process lock

Goal: every file adapter's check-then-write is atomic across processes.

- [x] [file-lock.mjs](../../../../src/file-lock.mjs) with acquire / stale break / owner-checked release / timeout
- [x] `JsonlEventStore.append` under the log lock
- [x] `FileSystemVfs.writeAtomic` and `remove` under per-path locks; `.ssss-locks/` reserved and hidden from `list()`
- [x] `FileLeaseStore.acquire`, `renew`, `release` under per-lease locks
- [x] `FileIdempotencyStore.put` under per-key locks

## ✅ Phase 3: Multi-process conformance

Goal: prove at most one racer wins for every adapter.

- [x] Event store: N processes append the same `event_id` → one success, one line
- [x] VFS: N processes create the same path → one success; N processes CAS the same version → one success
- [x] Leases: N processes acquire the same target → one lease
- [x] Idempotency: N processes put the same key → one entry
- [x] Locks: dead-holder break, stale-by-age break, live-lock timeout, symlinked-lock refusal
- [x] VFS reserved path rejected; `list()` hides lock files
- [x] Race checks fail against the pre-lock adapters

## ✅ Phase 4: Release hygiene

Goal: every published version has a matching tag.

- [x] `release.sh` bumps package.json/lockfile and inserts below `[Unreleased]`
- [x] Push skill publishes from a clean clone of the tag
- [x] `v0.8.0` (`5a57d61`) and `v0.9.0` (`64fa895`) tags reproduce the published tarballs

## ⏳ Phase 5: Release and downstream

- [ ] Release 0.9.2 via `skills/push`
- [ ] Dabber CRM bumped to `^0.9.2` and `test:ssss` green

## ⏳ Phase 6: Verification

- [ ] `npm test` green
- [ ] `npm run conformance` green
- [ ] `node skills/push/scripts/preflight-release.mjs` green
- [ ] Dabber-shaped benchmark still ~seconds with locking

## Open decision

- Kernel exactly-once for concurrent same-key `event` envelopes across
  processes needs an idempotency reservation step in the adapter contract
  (see PRD "Out of scope"). Awaiting a decision.

## Verification Log

- 2026-09-24: benchmark, 3,250 appends in instances of 400 on a 7,915-event 9.6 MB log — 279.5 s before, 1.70 s after
- 2026-09-24: `npm test` — 136/136 checks, exit 0 (0.9.1)
- 2026-09-24: new read-count check fails on the pre-0.9.1 store (14.3 MB read for a 2.7 KB log); behavior checks pass on both
- 2026-09-24: Dabber CRM `test:ssss` against packed and published 0.9.1 — pass
- 2026-09-24: race checks on pre-lock adapters, 10 runs — 9 runs failed at least one (event store 3, VFS create 3, VFS CAS 6)
- 2026-09-24: 16-process stress, 20 rounds — pre-lock: lease granted twice in 6, idempotency put accepted twice in 9; locked: 0 and 0
- 2026-09-24: 0.9 suite with locks, 10 runs — 10/10 full passes; `npm test` 146/146
- 2026-09-24: lock cost on APFS ~0.55 ms; 1,000 kernel commits 1.6–1.8 s (0.9.1) vs 3.0–3.8 s (locked); 3,250 event appends 1.6 s vs 3.2 s
- 2026-09-24: `scripts/release.sh` in a scratch copy — moves [Unreleased] entries, stubs when empty, idempotent on rerun
- 2026-09-24: `v0.8.0`/`v0.9.0` commits vs npm tarballs — 54 and 70 package files, 0 content or mode mismatches
