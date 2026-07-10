/**
 * Compatibility façade for the pre-0.9 `createEngine().processOperation()` API.
 * All behavior delegates to the shared kernel; this file contains no second
 * mutation implementation. New hosts should import `@gregiteen/ssss-cli/kernel`.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createKernel } from './kernel.mjs';
import { FileSystemVfs } from './vfs.mjs';
import { JsonlEventStore } from './events.mjs';
import { createValidator } from './validator.mjs';
import { loadRegistries } from './registry.mjs';
import { parseDocument } from './frontmatter.mjs';

export function resolveContainedPath(vaultRoot, vfsPath) {
  if (typeof vfsPath !== 'string' || !vfsPath || vfsPath.includes('\0') || vfsPath.includes('\\') || vfsPath.startsWith('/')) {
    throw new Error(`Unsafe VFS path '${vfsPath}'.`);
  }
  const parts = vfsPath.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new Error(`Unsafe VFS path '${vfsPath}'.`);
  const root = path.resolve(vaultRoot);
  const target = path.resolve(root, ...parts);
  if (target === root || !target.startsWith(`${root}${path.sep}`)) throw new Error(`VFS path '${vfsPath}' escapes the vault root.`);
  return target;
}

function legacyPrincipal(envelope, vaultRoot, callOptions = {}) {
  if (callOptions.principal) return callOptions.principal;
  const role = envelope.actor?.role;
  if (!role) return null;
  let capabilities = [];
  let kind = 'human';
  if (role === 'system') { kind = 'system'; capabilities = ['*:*']; }
  else if (role === 'admin') capabilities = ['*:*'];
  else if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(role)) {
    const roleFile = path.join(vaultRoot, 'roles', role, 'ROLE.md');
    if (fs.existsSync(roleFile)) {
      try { capabilities = parseDocument(fs.readFileSync(roleFile, 'utf8')).data.permissions || []; }
      catch { capabilities = []; }
    }
  }
  return {
    id: `legacy-role:${role}`,
    kind,
    workspaceIds: [envelope.workspace_id],
    capabilities,
    authentication: { provider: 'legacy-engine-adapter', assurance: 'adapter-verified' },
  };
}

class LegacyLeaseAdapter {
  constructor(root) { this.root = root; }
  #file(workspaceId, target) {
    const key = crypto.createHash('sha256').update(String(target)).digest('hex');
    return path.join(this.root, workspaceId, `${key}.lease.json`);
  }
  isRequired(workspaceId, target) {
    const file = this.#file(workspaceId, target);
    if (!fs.existsSync(file)) return false;
    try {
      const lease = JSON.parse(fs.readFileSync(file, 'utf8'));
      return new Date(lease.expires_at).getTime() > Date.now();
    } catch { return true; }
  }
  async verify(input) {
    const file = this.#file(input.workspace_id, input.target);
    if (!fs.existsSync(file)) return { valid: false, reason: 'Required lease is missing.' };
    try {
      const lease = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (new Date(lease.expires_at).getTime() <= Date.now()) return { valid: true, expired: true };
      if (!input.lease_id) return { valid: false, reason: 'Path is leased; lease_id is required.' };
      if (lease.lease_id !== input.lease_id) return { valid: false, reason: 'Lease mismatch.' };
      return { valid: true, lease };
    } catch { return { valid: false, reason: 'Lease state is unreadable.' }; }
  }
}

export function createEngine(options = {}) {
  const registrySet = options.registrySet || loadRegistries(options.registryDir);
  const validator = options.validator || createValidator({ registrySet });
  const kernels = new Map();
  const legacyLease = typeof options.leaseStore === 'string' ? new LegacyLeaseAdapter(options.leaseStore) : options.leaseStore;

  function bound(vaultRoot, eventLogDir) {
    const key = `${path.resolve(vaultRoot)}\0${eventLogDir ? path.resolve(eventLogDir) : ''}`;
    if (!kernels.has(key)) {
      fs.mkdirSync(vaultRoot, { recursive: true });
      const eventRoot = eventLogDir || path.join(vaultRoot, '.events');
      kernels.set(key, createKernel({
        vfs: new FileSystemVfs(vaultRoot),
        eventStore: new JsonlEventStore(eventRoot),
        leaseStore: legacyLease,
        validator,
      }));
    }
    return kernels.get(key);
  }

  return {
    async processOperation(envelope, vaultRoot, callOptions = {}) {
      const principal = options.verifyPrincipal
        ? await options.verifyPrincipal(envelope, callOptions)
        : legacyPrincipal(envelope, vaultRoot, callOptions);
      const response = await bound(vaultRoot, callOptions.eventLogDir).execute(envelope, {
        ...callOptions,
        principal,
        requireLease: legacyLease?.isRequired?.(envelope.workspace_id, envelope.path) || false,
      });
      // Preserve the pre-0.9 façade's unqualified validation type while the
      // canonical kernel and events use qualified identities.
      if (response.validation) {
        if (response.validation.type?.startsWith('ssss:')) response.validation.type = response.validation.type.slice('ssss:'.length);
        else if (!response.validation.type && typeof envelope.content === 'string' && envelope.type === 'operation') {
          try { response.validation.type = parseDocument(envelope.content).data.type || null; } catch {}
        }
      }
      return response;
    },
    resolveContainedPath,
    _types: registrySet.types,
    _registry: registrySet,
  };
}
