/** Canonical immutable SSSS event envelope and stores. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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

/** Read every event_id in a log, bounded to the bytes covered by the returned stat. */
function loadIndex(file) {
  const fd = openLog(file, fs.constants.O_RDONLY | NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const read = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (read === 0) break;
      offset += read;
    }
    const ids = new Set();
    for (const line of bytes.subarray(0, offset).toString('utf8').split('\n')) {
      if (line.trim()) ids.add(JSON.parse(line).event_id);
    }
    return { ids, stat };
  } finally { fs.closeSync(fd); }
}

export class JsonlEventStore {
  // Per-log index of event_ids, built on the first append to that log. Each
  // index records the stat of the bytes it covers; any change (another store
  // instance or process appended, or the file was replaced) rebuilds it.
  #indexes = new Map();
  constructor(root) {
    fs.mkdirSync(root, { recursive: true });
    this.root = fs.realpathSync(root);
  }
  #file(workspaceId) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(workspaceId || '')) throw new Error('Unsafe event workspace_id.');
    return path.join(this.root, `${workspaceId}.jsonl`);
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
    const index = loadIndex(file);
    this.#indexes.set(file, index);
    return index;
  }
  async append(event) {
    const file = this.#file(event.workspace_id);
    const index = this.#index(file);
    if (index.ids.has(event.event_id)) throw new Error(`Duplicate event_id '${event.event_id}'.`);
    const line = `${JSON.stringify(event)}\n`;
    this.#indexes.delete(file);
    const fd = openLog(file, APPEND_FLAGS, 0o600);
    let after;
    try {
      fs.writeFileSync(fd, line);
      after = fs.fstatSync(fd);
    } finally { fs.closeSync(fd); }
    // Keep the index only when the log grew by exactly this line on the same
    // file; otherwise another writer interleaved and the next append rebuilds.
    const before = index.stat;
    const expectedSize = (before?.size || 0) + Buffer.byteLength(line);
    if (after.size === expectedSize && (!before || (before.dev === after.dev && before.ino === after.ino))) {
      index.ids.add(event.event_id);
      this.#indexes.set(file, { ids: index.ids, stat: after });
    }
    return structuredClone(event);
  }
  async *replay(options = {}) {
    const files = options.workspaceId
      ? [this.#file(options.workspaceId)]
      : fs.readdirSync(this.root).filter((name) => name.endsWith('.jsonl')).sort().map((name) => path.join(this.root, name));
    let cursor = 0;
    for (const file of files) {
      if (!fs.existsSync(file)) continue;
      if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Symlinked event logs are forbidden.');
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        cursor++;
        if (cursor <= (options.cursor || 0)) continue;
        yield { cursor, event: JSON.parse(line) };
      }
    }
  }
}
