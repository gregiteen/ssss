---
type: project_document
title: FILE_ADAPTER_CONCURRENCY_HARDENING — Product Requirements
tags: ["project-management", "FILE_ADAPTER_CONCURRENCY_HARDENING"]
timestamp: 2026-09-25T03:21:52Z
---

# FILE_ADAPTER_CONCURRENCY_HARDENING — Product Requirements

> **Project Prefix**: `FILE_ADAPTER_CONCURRENCY_HARDENING`
> **Kanban State**: 🏗️ In Progress
> **Author**: Claude (Opus 5.5) with Greg Iteen
> **Date**: 2026-09-24

---

## Problem

The reference file adapters in `@gregiteen/ssss-cli` are what hosts run in
production (Dabber CRM commits through `JsonlEventStore`, `FileSystemVfs`, and
`FileIdempotencyStore`). Two classes of defect were found:

1. **Throughput.** `JsonlEventStore.append` re-read and re-parsed the whole
   workspace log on every append to reject a duplicate `event_id`, so N appends
   cost O(N × log size). Dabber CRM: 3,250 documents against a 7,915-event,
   7.8 MB log took ~6.5 minutes. (Shipped in 0.9.1.)
2. **Cross-process atomicity.** Each file adapter checks state and then writes
   it as two separate steps, so two processes can both pass the check:
   - `FileSystemVfs.writeAtomic`/`remove`: two writers can both pass the version
     (compare-and-swap) check; the last rename wins and the other update is lost.
     Violates the §6.5 version-conflict contract.
   - `FileLeaseStore.acquire`: two processes can both be granted the same lease.
     Violates §7 "At most one active lease MAY exist per (workspace_id, path)".
   - `FileIdempotencyStore.put`: a second writer silently replaces the first
     entry instead of failing.
   - `JsonlEventStore.append`: two processes can both append the same
     `event_id`.

A related release-process gap: npm 0.8.0 and 0.9.0 were published from
uncommitted working trees, so no commit matches either tarball and the
`v0.8.0`/`v0.9.0` tags the push skill requires were never created.
`scripts/release.sh` also inserts the new CHANGELOG section above
`[Unreleased]` and does not bump `package.json`.

## Scope

In scope:
- Event-id index for `JsonlEventStore` (0.9.1, shipped).
- One shared cross-process lock used by all four file adapters.
- Multi-process conformance checks for each adapter.
- Release hygiene: `release.sh`, publishing from a clean checkout of the tag,
  tags for the published 0.8.0 and 0.9.0 tarballs.
- Release 0.9.2 and bump Dabber CRM.

Out of scope (needs a contract decision, tracked below):
- Kernel-level exactly-once for concurrent `event` envelopes that share an
  idempotency key across processes. `event` envelopes have no VFS
  compare-and-swap, so the kernel's only guard is the idempotency store, which
  is read before commit and written after. Closing it needs an idempotency
  reservation step in the adapter contract.

## Requirements

1. `JsonlEventStore.append` reads a log at most once per store instance unless
   another writer changed it. (0.9.1)
2. For every file adapter, when N processes race the same check-then-write, at
   most one succeeds and the rest fail with the adapter's existing error.
3. A lock left by a crashed holder never blocks forever: it is broken when the
   holder is known dead (same host) or older than a stale threshold.
4. Lock files never collide with document paths; symlinked locks are refused.
5. Existing single-process behavior, error messages, symlink refusal, 0600
   modes, and replay order are unchanged. `npm test` stays green.
6. Every published version has a git tag whose package files match the npm
   tarball, and future releases are published from a clean checkout of the tag.
