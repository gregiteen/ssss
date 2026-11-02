/** Canonical immutable SSSS event envelope and stores. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { withFileLock } from './file-lock.mjs';
import { fsyncDirectory } from './durable-fs.mjs';

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

const keyId = (workspaceId, idempotencyKey) => JSON.stringify([workspaceId, idempotencyKey]);

export class MemoryEventStore {
  #events = [];
  #ids = new Set();
  #keys = new Map();
  async append(event) {
    if (this.#ids.has(event.event_id)) throw new Error(`Duplicate event_id '${event.event_id}'.`);
    const frozen = structuredClone(event);
    this.#events.push(frozen);
    this.#ids.add(frozen.event_id);
    const id = keyId(frozen.workspace_id, frozen.idempotency_key);
    if (!this.#keys.has(id)) this.#keys.set(id, frozen);
    return structuredClone(frozen);
  }
  /** The first event committed under (workspace, key), or null (spec §6.4). */
  async findByIdempotencyKey(workspaceId, idempotencyKey) {
    const event = this.#keys.get(keyId(workspaceId, idempotencyKey));
    return event ? structuredClone(event) : null;
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

/**
 * Split a log into lines on raw bytes, one line at a time, never materializing
 * the complete log. Each record carries the byte offset of its line, and
 * `complete: false` for a final line with no newline yet (an append in flight).
 */
function* logRecords(fd, size) {
  const buffer = Buffer.alloc(64 * 1024);
  let position = 0, start = 0, pending = [];
  while (position < size) {
    const read = fs.readSync(fd, buffer, 0, Math.min(buffer.length, size - position), position);
    if (read === 0) break;
    let from = 0, newline;
    while ((newline = buffer.indexOf(0x0a, from)) !== -1 && newline < read) {
      pending.push(buffer.subarray(from, newline));
      yield { offset: start, text: Buffer.concat(pending).toString('utf8'), complete: true };
      pending = [];
      start = position + newline + 1;
      from = newline + 1;
    }
    // Copy: the read buffer is reused by the next iteration.
    if (from < read) pending.push(Buffer.from(buffer.subarray(from, read)));
    position += read;
  }
  if (pending.length) yield { offset: start, text: Buffer.concat(pending).toString('utf8'), complete: false };
}

function* logLines(fd, size) {
  for (const record of logRecords(fd, size)) yield record.text;
}

/**
 * Read every event_id and the first offset of every idempotency key, bounded
 * to the bytes covered by the returned stat. A reader outside the append lock
 * passes `partialTail` so another writer's in-flight line is skipped instead
 * of failing to parse; the index then records that it is partial.
 */
function loadIndex(file, { partialTail = false } = {}) {
  const fd = openLog(file, fs.constants.O_RDONLY | NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd), ids = new Set(), keys = new Map();
    let partial = false;
    for (const { offset, text, complete } of logRecords(fd, stat.size)) {
      if (!text.trim()) continue;
      if (!complete && partialTail) { partial = true; continue; }
      const event = JSON.parse(text);
      ids.add(event.event_id);
      if (typeof event.idempotency_key === 'string' && !keys.has(event.idempotency_key)) {
        keys.set(event.idempotency_key, { file, offset });
      }
    }
    return { ids, keys, stat, partial };
  } finally { fs.closeSync(fd); }
}

/** Parse the single log line that starts at `offset`, or null if it is gone. */
function readEventAt(file, offset) {
  let fd;
  try { fd = openLog(file, fs.constants.O_RDONLY | NOFOLLOW); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  try {
    const size = fs.fstatSync(fd).size;
    const buffer = Buffer.alloc(16 * 1024), chunks = [];
    for (let position = offset; position < size;) {
      const read = fs.readSync(fd, buffer, 0, Math.min(buffer.length, size - position), position);
      if (read === 0) break;
      const newline = buffer.indexOf(0x0a);
      if (newline !== -1 && newline < read) { chunks.push(Buffer.from(buffer.subarray(0, newline))); break; }
      chunks.push(Buffer.from(buffer.subarray(0, read)));
      position += read;
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; }
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
  // `partialTail` is for readers outside the append lock (see loadIndex). An
  // index built that way is cached, but the append path never trusts it.
  #index(file, { partialTail = false } = {}) {
    const workspaceId = path.basename(file, '.jsonl');
    let stat;
    try { stat = fs.lstatSync(file); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.#indexes.delete(file);
      stat = null;
    }
    if (stat?.isSymbolicLink()) throw new Error('Symlinked event logs are forbidden.');
    const cached = this.#indexes.get(file);
    if (cached && cached.stat && stat && sameStat(cached.stat, stat) && (partialTail || !cached.partial)) return cached;
    // Duplicate detection spans the live log AND every archive segment:
    // rotating a log must never let an already-recorded event_id be appended
    // again. Archives are immutable, so their ids are collected once per
    // rebuild; only the live file's stat decides when a rebuild is needed.
    // Keys keep their first occurrence, oldest segment first.
    const ids = new Set(), keys = new Map();
    const merge = (part) => {
      for (const id of part.ids) ids.add(id);
      for (const [key, entry] of part.keys) if (!keys.has(key)) keys.set(key, entry);
    };
    for (const archive of this.#archives(workspaceId)) {
      let archiveStat;
      try { archiveStat = fs.lstatSync(archive); } catch { continue; }
      if (archiveStat.isSymbolicLink()) throw new Error('Symlinked event logs are forbidden.');
      merge(loadIndex(archive));
    }
    if (!stat) return { ids, keys, stat: null, partial: false };
    const live = loadIndex(file, { partialTail });
    merge(live);
    const index = { ids, keys, stat, partial: live.partial };
    this.#indexes.set(file, index);
    return index;
  }
  /**
   * The first event committed under (workspace, key), or null (spec §6.4).
   * The index holds only offsets; the event itself is read on a hit, which
   * only a retry causes. A segment rotated between the index read and the
   * line read is detected by the key check and retried once on a fresh index.
   */
  async findByIdempotencyKey(workspaceId, idempotencyKey) {
    const file = this.#file(workspaceId);
    for (let attempt = 0; attempt < 2; attempt++) {
      const entry = this.#index(file, { partialTail: true }).keys.get(idempotencyKey);
      if (!entry) return null;
      const event = readEventAt(entry.file, entry.offset);
      if (event?.idempotency_key === idempotencyKey && event.workspace_id === workspaceId) return event;
      this.#indexes.delete(file);
    }
    return null;
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
      // The append is the commit point (spec §6.3): it is on disk before the
      // kernel reports success, and so is a log this append created.
      fs.fsyncSync(fd);
      after = fs.fstatSync(fd);
    } finally { fs.closeSync(fd); }
    if (!before) fsyncDirectory(this.root);
    // Cache the index only when the log grew by exactly this line on the same
    // file. After a rotation the live file is brand new, so the previous stat
    // is meaningless and the next append rebuilds from the archives instead.
    const offset = before?.size || 0;
    const expectedSize = offset + Buffer.byteLength(line);
    if (!rotated && after.size === expectedSize && (!before || (before.dev === after.dev && before.ino === after.ino))) {
      index.ids.add(event.event_id);
      if (typeof event.idempotency_key === 'string' && !index.keys.has(event.idempotency_key)) {
        index.keys.set(event.idempotency_key, { file, offset });
      }
      this.#indexes.set(file, { ids: index.ids, keys: index.keys, stat: after, partial: false });
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
