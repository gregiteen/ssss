/** Durable and in-memory idempotency store contracts. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function key(workspaceId, idempotencyKey) { return JSON.stringify([workspaceId, idempotencyKey]); }

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
  constructor(root) { fs.mkdirSync(root, { recursive: true }); this.root = fs.realpathSync(root); }
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
    if (fs.existsSync(file)) throw new Error('Idempotency entry already exists.');
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temp, `${JSON.stringify(value)}\n`, { flag: 'wx', mode: 0o600 });
      fs.renameSync(temp, file);
    } finally { fs.rmSync(temp, { force: true }); }
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
