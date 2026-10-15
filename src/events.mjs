/** Canonical immutable SSSS event envelope and stores. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { withFileLock } from './file-lock.mjs';

// UUIDv5 namespace for event ids derived from idempotency keys.
const IDEMPOTENT_EVENT_NAMESPACE = Buffer.from('6f1c2d9e4b7a4e0c9f35a1d8c3b2e7f4', 'hex');

/**
 * Deterministic event_id (UUIDv5) for one (workspace_id, idempotency_key).
 * The kernel uses it for `event` envelopes so a store's duplicate-event_id
 * check stops two concurrent requests with the same key from both appending.
 */
export function idempotentEventId(workspaceId, idempotencyKey) {
  const hash = crypto.createHash('sha1').update(IDEMPOTENT_EVENT_NAMESPACE).update(JSON.stringify([workspaceId, idempotencyKey])).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createCanonicalEvent(input, options = {}) {
  const required = ['workspace_id', 'action', 'subject', 'operation_id', 'idempotency_key'];
  for (const field of required) if (typeof input?.[field] !== 'string' || !input[field]) throw new Error(`Event ${field} is required.`);
  if (!input.principal?.id || !input.principal?.kind) throw new Error('Event verified principal is required.');
  return {
    event_id: input.event_id || crypto.randomUUID(),
    event_type: input.event_type || 'ssss.mutation',
    schema_version: 1,
    timestamp: input.timestamp || (options.clock ? options.clock() : new Date().toISOString()),
    workspace_id: input.workspace_id,
    primitive_id: input.primitive_id || null,
    primitive_version: input.primitive_version || 1,
    action: input.action,
    subject: input.subject,
    principal: input.principal,
    correlation_id: input.correlation_id || input.operation_id,
    causation_id: input.causation_id || null,
    operation_id: input.operation_id,
    idempotency_key: input.idempotency_key,
    request_hash: input.request_hash || null,
    before_hash: input.before_hash || null,
    after_hash: input.after_hash || null,
    changed_fields: input.changed_fields || [],
    resource_status: input.resource_status || null,
    payload: input.payload || null,
  };
}

export class MemoryEventStore {
  #events = [];
  #ids = new Set();
  async append(event) {
    if (this.#ids.has(event.event_id)) throw new Error(`Duplicate event_id '${event.event_id}'.`);
    const frozen = structuredClone(event);
    this.#events.push(frozen);
    this.#ids.add(frozen.event_id);
    return structuredClone(frozen);
  }
  async *replay(options = {}) {
    for (let index = options.cursor || 0; index < this.#events.length; index++) {
      const event = this.#events[index];
      if (options.workspaceId && event.workspace_id !== options.workspaceId) continue;
      yield { cursor: index + 1, event: structuredClone(event) };
    }
  }
  async size() { return this.#events.length; }
}

const NOFOLLOW = fs.constants.O_NOFOLLOW || 0;
const APPEND_FLAGS = fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | NOFOLLOW;

function openLog(file, flags, mode) {
  try { return fs.openSync(file, flags, mode); }
  catch (error) {
    if (error.code === 'ELOOP') throw new Error('Symlinked event logs are forbidden.');
    throw error;
  }
}

function sameStat(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}

/** Decode one line at a time, never materializing the complete log as a string. */
function* logLines(fd, size) {
  const buffer = Buffer.alloc(64 * 1024);
  const decoder = new StringDecoder('utf8');
  let offset = 0, pending = '';
  while (offset < size) {
    const read = fs.readSync(fd, buffer, 0, Math.min(buffer.length, size - offset), offset);
    if (read === 0) break;
    offset += read;
    const text = pending + decoder.write(buffer.subarray(0, read));
    let start = 0, newline;
    while ((newline = text.indexOf('\n', start)) !== -1) {
      yield text.slice(start, newline);
      start = newline + 1;
    }
    pending = text.slice(start);
  }
  pending += decoder.end();
  if (pending) yield pending;
}

/** Read every event_id, bounded to the bytes covered by the returned stat. */
function loadIndex(file) {
  const fd = openLog(file, fs.constants.O_RDONLY | NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd), ids = new Set();
    for (const line of logLines(fd, stat.size)) if (line.trim()) ids.add(JSON.parse(line).event_id);
    return { ids, stat };
  } finally { fs.closeSync(fd); }
}

export class JsonlEventStore {
  // Per-log index of event_ids, built on the first append to that log. Each
  // index records the stat of the bytes it covers; any change (another store
  // instance or process appended, or the file was replaced) rebuilds it.
  // Appenders serialize on `<log>.lock` so the duplicate check and the append
  // are atomic across processes.
  #indexes = new Map();
  constructor(root, options = {}) {
    fs.mkdirSync(root, { recursive: true });
    this.root = fs.realpathSync(root);
    this.lockOptions = options.lock || {};
    // Rotation cap in bytes per live log (SSSS_EVENT_MAX_BYTES, default 32 MiB,
    // 0 disables). Without it a single append-only log grows without bound --
    // one reached 653 MB and made the vault impossible to back up, because
    // GitHub hard-rejects blobs over 100 MB.
    const cap = Number(options.maxBytes ?? process.env.SSSS_EVENT_MAX_BYTES ?? 32 * 1024 * 1024);
    this.maxBytes = Number.isFinite(cap) && cap >= 0 ? cap : 32 * 1024 * 1024;
  }
  #file(workspaceId) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(workspaceId || '')) throw new Error('Unsafe event workspace_id.');
    return path.join(this.root, `${workspaceId}.jsonl`);
  }
  /**
   * Archive segments for one workspace, in replay order.
   *
   * Segments are named `<workspaceId>.<seq>.jsonl` with a fixed-width
   * zero-padded sequence, and replay() concatenates live-then-archives rather
   * than relying on a plain alphabetical sort -- `default.0001.jsonl` sorts
   * BEFORE `default.jsonl`, which would replay archived events out of order.
   */
  #archives(workspaceId) {
    const prefix = `${workspaceId}.`;
    const suffix = '.jsonl';
    let names;
    try { names = fs.readdirSync(this.root); } catch { return []; }
    return names
      .filter((n) => n.startsWith(prefix) && n.endsWith(suffix) && /^\d+$/.test(n.slice(prefix.length, -suffix.length)))
      .sort((a, b) => {
        const ai = Number(a.slice(prefix.length, -suffix.length));
        const bi = Number(b.slice(prefix.length, -suffix.length));
        return ai - bi;
      })
      .map((n) => path.join(this.root, n));
  }
  /**
   * Moves the live log aside once it passes the cap, preserving every byte and
   * the original line order. The live file is renamed, never rewritten or
   * truncated, so no consumer holding a cursor loses a record: archives hold
   * strictly older events and replay() yields archives first, then live.
   *
   * The duplicate-event_id index is rebuilt from the archives on demand by
   * #index(), so uniqueness survives rotation.
   */
  #rotate(file, workspaceId) {
    if (this.maxBytes <= 0) return 0;
    let size;
    try { size = fs.lstatSync(file).size; } catch { return 0; }
    if (size <= this.maxBytes) return 0;
    // Continue the sequence from the highest existing archive rather than the
    // count, so a gap (a manually removed segment) cannot cause a collision.
    const existing = this.#archives(workspaceId);
    let seq = 1;
    for (const p of existing) {
      const m = /\.(\d+)\.jsonl$/.exec(p);
      if (m) seq = Math.max(seq, Number(m[1]) + 1);
    }
    const target = path.join(this.root, `${workspaceId}.${String(seq).padStart(4, '0')}.jsonl`);
    if (fs.existsSync(target)) return 0;
    try {
      fs.renameSync(file, target);
      this.#indexes.delete(file);
      this.#indexes.delete(target);
      return 1;
    } catch {
      // Leave the oversized log in place rather than lose it; the next append
      // retries. Growth stays bounded by the cap check on every append.
      return 0;
    }
  }
  #index(file) {
    let stat;
    try { stat = fs.lstatSync(file); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.#indexes.delete(file);
      return { ids: new Set(), stat: null };
    }
    if (stat.isSymbolicLink()) throw new Error('Symlinked event logs are forbidden.');
    const cached = this.#indexes.get(file);
    if (cached && sameStat(cached.stat, stat)) return cached;
    // Duplicate detection spans the live log AND every archive segment:
    // rotating a log must never let an already-recorded event_id be appended
    // again. Archives are immutable, so their ids are collected once per
    // rebuild; only the live file's stat decides when a rebuild is needed.
    const ids = new Set();
    const workspaceId = path.basename(file, '.jsonl');
    for (const archive of this.#archives(workspaceId)) {
      let archiveStat;
      try { archiveStat = fs.lstatSync(archive); } catch { continue; }
      if (archiveStat.isSymbolicLink()) throw new Error('Symlinked event logs are forbidden.');
      for (const id of loadIndex(archive).ids) ids.add(id);
    }
    const live = loadIndex(file);
    for (const id of live.ids) ids.add(id);
    const index = { ids, stat };
    this.#indexes.set(file, index);
    return index;
  }
  async append(event) {
    const file = this.#file(event.workspace_id);
    return withFileLock(`${file}.lock`, () => this.#appendLocked(file, event), this.lockOptions);
  }
  #appendLocked(file, event) {
    const index = this.#index(file);
    if (index.ids.has(event.event_id)) throw new Error(`Duplicate event_id '${event.event_id}'.`);
    // Rotate before writing so the live log never exceeds the cap by more than
    // a single line. Safe under the append lock: no other writer is mid-append.
    const rotated = this.#rotate(file, event.workspace_id);
    const line = `${JSON.stringify(event)}\n`;
    this.#indexes.delete(file);
    const before = rotated ? null : index.stat;
    const fd = openLog(file, APPEND_FLAGS, 0o600);
    let after;
    try {
      fs.writeFileSync(fd, line);
      after = fs.fstatSync(fd);
    } finally { fs.closeSync(fd); }
    // Cache the index only when the log grew by exactly this line on the same
    // file. After a rotation the live file is brand new, so the previous stat
    // is meaningless and the next append rebuilds from the archives instead.
    const expectedSize = (before?.size || 0) + Buffer.byteLength(line);
    if (!rotated && after.size === expectedSize && (!before || (before.dev === after.dev && before.ino === after.ino))) {
      index.ids.add(event.event_id);
      this.#indexes.set(file, { ids: index.ids, stat: after });
    }
    return structuredClone(event);
  }
  async *replay(options = {}) {
    // Replay order is archives-then-live, oldest first. A plain alphabetical
    // sort would put `default.0001.jsonl` before `default.jsonl` (correct by
    // accident) but break as soon as a workspace has a name that sorts after a
    // digit, and live-first would replay new events before old ones.
    const files = options.workspaceId
      ? [...this.#archives(options.workspaceId), this.#file(options.workspaceId)]
      : (() => {
          const names = fs.readdirSync(this.root).filter((name) => name.endsWith('.jsonl'));
          const workspaces = new Set();
          for (const name of names) {
            const m = /^([A-Za-z0-9][A-Za-z0-9._-]{0,127}?)(?:\.\d+)?\.jsonl$/.exec(name);
            if (m) workspaces.add(m[1]);
          }
          return [...workspaces].sort().flatMap((w) => [...this.#archives(w), this.#file(w)]);
        })();
    let cursor = 0;
    for (const file of files) {
      if (!fs.existsSync(file)) continue;
      if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Symlinked event logs are forbidden.');
      const fd = openLog(file, fs.constants.O_RDONLY | NOFOLLOW);
      try {
        for (const line of logLines(fd, fs.fstatSync(fd).size)) {
          if (!line.trim()) continue;
          cursor++;
          if (cursor <= (options.cursor || 0)) continue;
          yield { cursor, event: JSON.parse(line) };
        }
      } finally { fs.closeSync(fd); }
    }
  }
}
