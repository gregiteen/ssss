/** Durable and in-memory idempotency store contracts. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { withFileLock } from './file-lock.mjs';

function key(workspaceId, idempotencyKey) { return JSON.stringify([workspaceId, idempotencyKey]); }

/**
 * How long a completed operation stays replayable. A retry of the same request
 * arrives within minutes (a network timeout, an agent restart); nothing needs a
 * day-old result, and retaining them forever is what filled a live vault with
 * 283k files. Override per store with `new FileIdempotencyStore(root, { retentionMs })`.
 */
export const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Prune once every N puts, so retention costs one directory scan per N writes. */
export const DEFAULT_PRUNE_EVERY = 500;

export class MemoryIdempotencyStore {
  #entries = new Map();
  async get(workspaceId, idempotencyKey) { return structuredClone(this.#entries.get(key(workspaceId, idempotencyKey)) || null); }
  async put(workspaceId, idempotencyKey, value) {
    const id = key(workspaceId, idempotencyKey);
    if (this.#entries.has(id)) throw new Error('Idempotency entry already exists.');
    this.#entries.set(id, structuredClone(value));
  }
}

export class FileIdempotencyStore {
  constructor(root, options = {}) {
    fs.mkdirSync(root, { recursive: true });
    this.root = fs.realpathSync(root);
    this.lockOptions = options.lock || {};
    // An idempotency entry exists to reject a retry of the same request. That
    // window is minutes, not forever, so entries are retained for a bounded age
    // and then removed. Without this the directory only grows: one frequently
    // rewritten document created 14,438 records from a single path, and a live
    // vault reached 283k files / 1.2 GB, which slowed every traversal of it.
    this.retentionMs = Number.isFinite(options.retentionMs) && options.retentionMs >= 0
      ? options.retentionMs
      : DEFAULT_RETENTION_MS;
    this.pruneEvery = Number.isInteger(options.pruneEvery) && options.pruneEvery > 0
      ? options.pruneEvery
      : DEFAULT_PRUNE_EVERY;
    this.puts = 0;
  }
  #file(workspaceId, idempotencyKey) {
    const digest = crypto.createHash('sha256').update(key(workspaceId, idempotencyKey)).digest('hex');
    return path.join(this.root, `${digest}.json`);
  }
  async get(workspaceId, idempotencyKey) {
    const file = this.#file(workspaceId, idempotencyKey);
    if (!fs.existsSync(file)) return null;
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Idempotency state is unreadable.');
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { throw new Error('Idempotency state is unreadable.'); }
  }
  async put(workspaceId, idempotencyKey, value) {
    const file = this.#file(workspaceId, idempotencyKey);
    // Serialize writers of one key so a second put fails instead of replacing the first.
    return withFileLock(`${file}.lock`, () => {
      if (fs.existsSync(file)) throw new Error('Idempotency entry already exists.');
      const temp = `${file}.${crypto.randomUUID()}.tmp`;
      try {
        fs.writeFileSync(temp, `${JSON.stringify(value)}\n`, { flag: 'wx', mode: 0o600 });
        fs.renameSync(temp, file);
      } finally { fs.rmSync(temp, { force: true }); }
      // Opportunistic retention: no scheduler, and the cost is amortised over
      // putPushes. Never throws — a prune failure must not reject a committed
      // operation, whose result the caller is about to rely on.
      this.puts += 1;
      if (this.retentionMs > 0 && this.puts % this.pruneEvery === 0) {
        try { this.prune(); } catch { /* retention is best-effort */ }
      }
    }, this.lockOptions);
  }
  /**
   * Remove entries older than the retention window. Returns the count removed.
   * Only regular `*.json` files are considered; lock files and temp files are
   * left alone so a concurrent writer is never disturbed.
   */
  prune(now = Date.now()) {
    if (!(this.retentionMs > 0)) return 0;
    const cutoff = now - this.retentionMs;
    let removed = 0;
    let entries;
    try { entries = fs.readdirSync(this.root); } catch { return 0; }
    for (const name of entries) {
      if (!name.endsWith('.json')) continue;
      const file = path.join(this.root, name);
      try {
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink()) continue;
        if (stat.mtimeMs < cutoff) { fs.rmSync(file, { force: true }); removed += 1; }
      } catch { /* a vanished or unreadable entry is not a prune failure */ }
    }
    return removed;
  }
}

export async function runIdempotencyContract(store) {
  const workspace = `ws-${crypto.randomUUID()}`;
  const id = `key-${crypto.randomUUID()}`;
  const checks = [];
  const record = (name, passed) => checks.push({ name, passed: !!passed });
  record('missing key returns null', await store.get(workspace, id) === null);
  await store.put(workspace, id, { request_hash: 'sha256:test', response: { success: true } });
  record('stored result round-trips', (await store.get(workspace, id))?.request_hash === 'sha256:test');
  let duplicate = false;
  try { await store.put(workspace, id, { request_hash: 'different' }); } catch { duplicate = true; }
  record('duplicate put is rejected', duplicate);
  return { passed: checks.every((check) => check.passed), checks };
}
