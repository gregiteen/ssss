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
  async append(event) {
    if (this.#events.some((existing) => existing.event_id === event.event_id)) {
      throw new Error(`Duplicate event_id '${event.event_id}'.`);
    }
    const frozen = structuredClone(event);
    this.#events.push(frozen);
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

export class JsonlEventStore {
  constructor(root) {
    fs.mkdirSync(root, { recursive: true });
    this.root = fs.realpathSync(root);
  }
  #file(workspaceId) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(workspaceId || '')) throw new Error('Unsafe event workspace_id.');
    return path.join(this.root, `${workspaceId}.jsonl`);
  }
  async append(event) {
    const file = this.#file(event.workspace_id);
    if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error('Symlinked event logs are forbidden.');
    if (fs.existsSync(file)) {
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (line.trim() && JSON.parse(line).event_id === event.event_id) throw new Error(`Duplicate event_id '${event.event_id}'.`);
      }
    }
    fs.appendFileSync(file, `${JSON.stringify(event)}\n`, { mode: 0o600 });
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
