---
type: project_document
title: FILE_ADAPTER_CONCURRENCY_HARDENING — Architecture
tags: ["project-management", "FILE_ADAPTER_CONCURRENCY_HARDENING"]
timestamp: 2026-09-25T03:21:52Z
---

# FILE_ADAPTER_CONCURRENCY_HARDENING — Architecture

> **Project Prefix**: `FILE_ADAPTER_CONCURRENCY_HARDENING`
> **Kanban State**: ✅ Completed
> **Author**: Claude (Opus 5.5) with Greg Iteen
> **Date**: 2026-09-24

---

## Components

### `src/file-lock.mjs` (new, internal)

`withFileLock(lockPath, fn, { timeoutMs = 40_000, staleMs = 30_000 })`

- **Acquire:** `open(lockPath, O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW, 0600)` and
  write `{ token, pid, host, acquired_at }`. `O_EXCL` never follows a symlink,
  so a symlinked lock reads as "held" and is then refused as not a regular file.
- **Contended:** poll with jittered backoff (1–50 ms). Each poll checks whether
  the lock is stale: the holder is on this host and `process.kill(pid, 0)`
  reports `ESRCH`, or the lock's mtime is older than `staleMs`.
- **Break stale:** `rename` the lock to a unique `.stale` name so exactly one
  breaker wins. If the moved file's inode differs from the one judged stale, a
  live holder replaced it in the meantime, so `link` it back.
- **Release:** remove the lock only if it still carries our token.
- **Timeout:** `FileLockTimeoutError` (`code: SSSS_LOCK_TIMEOUT`).

The critical sections are short and synchronous (the event store never awaits
while holding the lock), so a 30 s stale threshold is far above any real hold
time, and the 40 s wait covers one crashed holder on another host.

### Adapter changes

| Adapter | Lock file | Critical section |
|---|---|---|
| `JsonlEventStore.append` | `<root>/<workspace>.jsonl.lock` | stat/index check → append → fstat |
| `FileSystemVfs.writeAtomic`, `remove` | `<vault>/.ssss-locks/<sha256(path)>.lock` | read → precondition → rename/unlink |
| `FileLeaseStore.acquire`, `renew`, `release` | `<root>/<sha256>.lease.json.lock` | load → check → write/remove |
| `FileIdempotencyStore.put` | `<root>/<sha256>.json.lock` | exists → temp write → rename |

- `.ssss-locks/` is reserved in `FileSystemVfs`: VFS paths whose first segment
  is `.ssss-locks` are rejected and `list()` skips it. Bundle export and
  semantic walkers already skip dot-directories.
- Event logs replay only `*.jsonl`, so `.lock` and `.stale` files are ignored.
- Each adapter constructor accepts `{ lock: { timeoutMs, staleMs } }`.

### Event-id index (0.9.1)

Per-instance `Map<logPath, { ids: Set, stat }>`; a changed stat (dev, ino,
size, mtime, ctime) forces a full reload. Under the lock, cooperating writers
cannot interleave; the post-append size/inode check remains for writers that do
not take the lock (older package versions, raw appends).

## Kernel: same idempotency key across processes

- `event` envelopes get `event_id = idempotentEventId(workspace_id,
  idempotency_key)` (UUIDv5, fixed namespace) so the event store's duplicate
  check decides the race. Other envelope types keep random ids: their VFS
  compare-and-swap decides the race, and a rollback-then-retry must be able to
  append again.
- On any commit failure, after rollback, the kernel re-reads the idempotency
  store and returns the winner's result (replay) or an idempotency conflict.
- Trade-off accepted: a crash between event append and idempotency `put`
  leaves that key failing on retry instead of appending a duplicate.

## Release process

- `scripts/release.sh <version>` bumps `VERSION`, `package.json` and
  `package-lock.json`, and inserts the section below `## [Unreleased]`.
- `skills/push` publishes from a clean clone of the pushed tag, so the tarball
  matches the tag and npm records `gitHead` (npm cannot read HEAD from a git
  worktree, which is why 0.9.0 and 0.9.1 have none).
- `v0.8.0`/`v0.9.0`: annotated tags on commits that reproduce the published
  tarballs' package files on top of the commit npm recorded (`6a9e93b`).
