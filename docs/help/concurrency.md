# File adapter concurrency

The reference file adapters can be shared by several processes on one
filesystem. Each adapter's check-then-write step runs under a lock file, so at
most one racer wins:

| Adapter | Guarantee across processes | Lock file |
|---------|----------------------------|-----------|
| `JsonlEventStore.append` | An `event_id` is appended at most once. | `<events>/<workspace>.jsonl.lock` |
| `FileSystemVfs.writeAtomic` / `remove` | `ifAbsent`, `ifPresent`, and `version` preconditions are compare-and-swap. | `<vault>/.ssss-locks/<sha256(path)>.lock` |
| `FileLeaseStore.acquire` / `renew` / `release` | At most one active lease per `(workspace_id, target)` (spec §7). | `<leases>/<sha256>.lease.json.lock` |
| `FileIdempotencyStore.put` | A second `put` for a key fails instead of replacing the first. | `<idempotency>/<sha256>.json.lock` |

`.ssss-locks/` is reserved: VFS paths under it are rejected and `list()` skips it.

## Same idempotency key from two processes

The kernel records a request's result only after it commits, so two processes
can both miss the stored result for one key. The commit step then decides:

- `operation`, `patch`, `delete`: the VFS compare-and-swap lets one commit; the
  other fails its precondition.
- `event`: the event's `event_id` is derived from `(workspace_id,
  idempotency_key)` (`idempotentEventId`, a UUIDv5), so the event store rejects
  the second append.

The loser then re-reads the idempotency store: if the winner has already
recorded its result, the loser returns it as a replay (or an idempotency
conflict when its request differs); otherwise it fails and a retry replays. If a
process dies after appending an event but before recording the result, retries
of that key fail rather than append a second event.

## Crashed holders

A lock records its holder's pid and host. A waiter breaks the lock when the
holder is on the same host and no longer running, or when the lock is older than
`staleMs` (default 30 s). A waiter gives up after `timeoutMs` (default 40 s) with
`SSSS_LOCK_TIMEOUT`. Both are adjustable per adapter:

```js
new JsonlEventStore(root, { lock: { timeoutMs: 10_000, staleMs: 15_000 } });
new FileSystemVfs(root, { lock: { timeoutMs: 10_000 } });
```

Symlinked lock files are refused.

## Limits

- Locks are advisory: only writers using these adapters take them. Writers from
  `@gregiteen/ssss-cli` 0.9.1 and earlier do not.
- Network filesystems must support exclusive create (`O_EXCL`).
- Dead-holder detection assumes processes that share the filesystem have
  distinct hostnames (containers with the same hostname and separate pid
  namespaces would look dead to each other). Stale detection compares the lock's
  mtime with the local clock, so hosts' clocks must agree to well within
  `staleMs`.

See also: `ssss help leases`, `ssss help conformance`.
