/** Standard lease store semantics. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function validateLeaseInput(value) {
  for (const field of ['workspace_id', 'target', 'principal_id', 'operation_id']) {
    if (typeof value?.[field] !== 'string' || !value[field]) throw new Error(`Lease ${field} is required.`);
  }
}

export class MemoryLeaseStore {
  #leases = new Map();
  constructor({ clock = () => Date.now() } = {}) { this.clock = clock; }
  #key(workspaceId, target) { return JSON.stringify([workspaceId, target]); }
  async acquire(input, ttlMs = 30_000) {
    validateLeaseInput(input);
    const key = this.#key(input.workspace_id, input.target);
    const existing = this.#leases.get(key);
    if (existing && existing.expires_at > this.clock()) throw new Error('Lease conflict.');
    const lease = { ...input, lease_id: input.lease_id || crypto.randomUUID(), issued_at: this.clock(), expires_at: this.clock() + ttlMs };
    this.#leases.set(key, lease);
    return { ...lease };
  }
  async verify(input) {
    const lease = this.#leases.get(this.#key(input.workspace_id, input.target));
    if (!lease) return { valid: false, reason: 'Required lease is missing.' };
    if (lease.expires_at <= this.clock()) return { valid: false, reason: 'Lease has expired.' };
    for (const field of ['lease_id', 'principal_id', 'operation_id']) {
      if (lease[field] !== input[field]) return { valid: false, reason: `Lease ${field} mismatch.` };
    }
    return { valid: true, lease: { ...lease } };
  }
  async renew(input, ttlMs = 30_000) {
    const verified = await this.verify(input);
    if (!verified.valid) throw new Error(verified.reason);
    verified.lease.expires_at = this.clock() + ttlMs;
    this.#leases.set(this.#key(input.workspace_id, input.target), verified.lease);
    return { ...verified.lease };
  }
  async release(input) {
    const verified = await this.verify(input);
    if (!verified.valid) throw new Error(verified.reason);
    this.#leases.delete(this.#key(input.workspace_id, input.target));
    return { released: true, lease_id: input.lease_id };
  }
}

export class FileLeaseStore {
  constructor(root, options = {}) {
    fs.mkdirSync(root, { recursive: true });
    this.root = fs.realpathSync(root);
    this.clock = options.clock || (() => Date.now());
  }
  #file(workspaceId, target) {
    const hash = crypto.createHash('sha256').update(`${workspaceId}\0${target}`).digest('hex');
    return path.join(this.root, `${hash}.lease.json`);
  }
  #load(workspaceId, target) {
    const file = this.#file(workspaceId, target);
    if (!fs.existsSync(file)) return null;
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Lease state is unreadable.');
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { throw new Error('Lease state is unreadable.'); }
  }
  #write(lease) {
    const file = this.#file(lease.workspace_id, lease.target);
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temp, `${JSON.stringify(lease)}\n`, { flag: 'wx', mode: 0o600 });
      fs.renameSync(temp, file);
    } finally { fs.rmSync(temp, { force: true }); }
  }
  async acquire(input, ttlMs = 30_000) {
    validateLeaseInput(input);
    const existing = this.#load(input.workspace_id, input.target);
    if (existing && existing.expires_at > this.clock()) throw new Error('Lease conflict.');
    const lease = { ...input, lease_id: input.lease_id || crypto.randomUUID(), issued_at: this.clock(), expires_at: this.clock() + ttlMs };
    this.#write(lease);
    return { ...lease };
  }
  async verify(input) {
    const lease = this.#load(input.workspace_id, input.target);
    if (!lease) return { valid: false, reason: 'Required lease is missing.' };
    if (lease.expires_at <= this.clock()) return { valid: false, reason: 'Lease has expired.' };
    for (const field of ['lease_id', 'principal_id', 'operation_id']) {
      if (lease[field] !== input[field]) return { valid: false, reason: `Lease ${field} mismatch.` };
    }
    return { valid: true, lease };
  }
  async renew(input, ttlMs = 30_000) {
    const verified = await this.verify(input);
    if (!verified.valid) throw new Error(verified.reason);
    verified.lease.expires_at = this.clock() + ttlMs;
    this.#write(verified.lease);
    return verified.lease;
  }
  async release(input) {
    const verified = await this.verify(input);
    if (!verified.valid) throw new Error(verified.reason);
    fs.rmSync(this.#file(input.workspace_id, input.target), { force: true });
    return { released: true, lease_id: input.lease_id };
  }
}

export async function runLeaseContract(store, { clock } = {}) {
  const input = {
    workspace_id: `ws-${crypto.randomUUID()}`,
    target: `rules/${crypto.randomUUID()}.md`,
    principal_id: 'principal',
    operation_id: 'operation',
  };
  const checks = [];
  const record = (name, passed) => checks.push({ name, passed: !!passed });
  const acquired = await store.acquire(input, 10_000);
  record('acquire returns bound lease', acquired.lease_id && acquired.principal_id === input.principal_id);
  record('matching lease verifies', (await store.verify({ ...input, lease_id: acquired.lease_id })).valid);
  record('mismatched owner fails closed', !(await store.verify({ ...input, principal_id: 'other', lease_id: acquired.lease_id })).valid);
  const renewed = await store.renew({ ...input, lease_id: acquired.lease_id }, 20_000);
  record('renew extends expiry', renewed.expires_at >= acquired.expires_at);
  await store.release({ ...input, lease_id: acquired.lease_id });
  record('released lease is missing', !(await store.verify({ ...input, lease_id: acquired.lease_id })).valid);
  return { passed: checks.every((check) => check.passed), checks };
}
