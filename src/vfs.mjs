/** Standard SSSS VFS adapter contract and reference implementations. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isSafeDocumentPath } from './registry.mjs';

export class VfsConflictError extends Error {
  constructor(message) { super(message); this.name = 'VfsConflictError'; this.code = 'SSSS_VFS_CONFLICT'; }
}

export class VfsPathError extends Error {
  constructor(message) { super(message); this.name = 'VfsPathError'; this.code = 'SSSS_VFS_PATH'; }
}

export function bytesHash(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function asBuffer(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
}

function checkPrecondition(current, precondition = {}) {
  if (precondition.ifAbsent && current) throw new VfsConflictError('Target already exists.');
  if (precondition.ifPresent && !current) throw new VfsConflictError('Target does not exist.');
  if (precondition.version !== undefined && current?.version !== precondition.version) {
    throw new VfsConflictError(`Version mismatch; expected '${precondition.version}', found '${current?.version || '(missing)'}'.`);
  }
}

export class MemoryVfs {
  #entries = new Map();

  async read(vfsPath) {
    if (!isSafeDocumentPath(vfsPath)) throw new VfsPathError(`Unsafe VFS path '${vfsPath}'.`);
    const entry = this.#entries.get(vfsPath);
    return entry ? { bytes: Buffer.from(entry.bytes), version: entry.version, hash: entry.hash } : null;
  }

  async stat(vfsPath) {
    const entry = await this.read(vfsPath);
    return entry ? { path: vfsPath, kind: 'file', size: entry.bytes.length, version: entry.version, hash: entry.hash } : null;
  }

  async *list(prefix = '') {
    if (prefix && !isSafeDocumentPath(prefix)) throw new VfsPathError(`Unsafe VFS prefix '${prefix}'.`);
    for (const key of [...this.#entries.keys()].sort()) {
      if (!prefix || key === prefix || key.startsWith(`${prefix}/`)) yield await this.stat(key);
    }
  }

  async writeAtomic(vfsPath, bytes, precondition = {}) {
    if (!isSafeDocumentPath(vfsPath)) throw new VfsPathError(`Unsafe VFS path '${vfsPath}'.`);
    const current = await this.read(vfsPath);
    checkPrecondition(current, precondition);
    const nextBytes = asBuffer(bytes);
    const hash = bytesHash(nextBytes);
    const version = hash;
    this.#entries.set(vfsPath, { bytes: Buffer.from(nextBytes), hash, version });
    return { path: vfsPath, hash, version, size: nextBytes.length };
  }

  async append(vfsPath, bytes, precondition = {}) {
    const current = await this.read(vfsPath);
    checkPrecondition(current, precondition);
    const combined = Buffer.concat([current?.bytes || Buffer.alloc(0), asBuffer(bytes)]);
    return this.writeAtomic(vfsPath, combined, current ? { version: current.version } : { ifAbsent: true });
  }

  async remove(vfsPath, precondition = {}) {
    const current = await this.read(vfsPath);
    checkPrecondition(current, precondition);
    if (!current) return { path: vfsPath, removed: false };
    this.#entries.delete(vfsPath);
    return { path: vfsPath, removed: true, previous_hash: current.hash };
  }
}

export class FileSystemVfs {
  constructor(root) {
    if (!root) throw new Error('FileSystemVfs requires a root directory.');
    fs.mkdirSync(root, { recursive: true });
    this.root = fs.realpathSync(root);
  }

  #resolve(vfsPath, { allowMissing = true } = {}) {
    if (!isSafeDocumentPath(vfsPath)) throw new VfsPathError(`Unsafe VFS path '${vfsPath}'.`);
    const target = path.resolve(this.root, ...vfsPath.split('/'));
    if (target === this.root || !target.startsWith(`${this.root}${path.sep}`)) {
      throw new VfsPathError(`VFS path '${vfsPath}' escapes the root.`);
    }
    let cursor = target;
    while (!fs.existsSync(cursor)) {
      const parent = path.dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
    if (fs.existsSync(cursor)) {
      const stat = fs.lstatSync(cursor);
      if (stat.isSymbolicLink()) throw new VfsPathError(`Symlinked VFS path is forbidden: '${vfsPath}'.`);
      const real = fs.realpathSync(cursor);
      if (real !== this.root && !real.startsWith(`${this.root}${path.sep}`)) {
        throw new VfsPathError(`VFS path '${vfsPath}' escapes through a filesystem alias.`);
      }
    }
    if (!allowMissing && !fs.existsSync(target)) return null;
    return target;
  }

  async read(vfsPath) {
    const target = this.#resolve(vfsPath, { allowMissing: false });
    if (!target) return null;
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) throw new VfsPathError(`Symlinked VFS path is forbidden: '${vfsPath}'.`);
    if (!stat.isFile()) throw new VfsPathError(`VFS path '${vfsPath}' is not a file.`);
    const bytes = fs.readFileSync(target);
    const hash = bytesHash(bytes);
    return { bytes, hash, version: hash };
  }

  async stat(vfsPath) {
    const entry = await this.read(vfsPath);
    return entry ? { path: vfsPath, kind: 'file', size: entry.bytes.length, hash: entry.hash, version: entry.version } : null;
  }

  async *list(prefix = '') {
    if (prefix && !isSafeDocumentPath(prefix)) throw new VfsPathError(`Unsafe VFS prefix '${prefix}'.`);
    const start = prefix ? this.#resolve(prefix) : this.root;
    if (!fs.existsSync(start)) return;
    const stack = [start];
    while (stack.length) {
      const dir = stack.pop();
      for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const absolute = path.join(dir, entry.name);
        const relative = path.relative(this.root, absolute).split(path.sep).join('/');
        if (entry.isSymbolicLink()) throw new VfsPathError(`Symlinked VFS entry is forbidden: '${relative}'.`);
        if (entry.isDirectory()) stack.push(absolute);
        else if (entry.isFile() && (!prefix || relative === prefix || relative.startsWith(`${prefix}/`))) {
          yield await this.stat(relative);
        }
      }
    }
  }

  async writeAtomic(vfsPath, bytes, precondition = {}) {
    const target = this.#resolve(vfsPath);
    const current = await this.read(vfsPath);
    checkPrecondition(current, precondition);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const parentReal = fs.realpathSync(path.dirname(target));
    if (parentReal !== this.root && !parentReal.startsWith(`${this.root}${path.sep}`)) {
      throw new VfsPathError(`VFS parent for '${vfsPath}' escapes the root.`);
    }
    const nextBytes = asBuffer(bytes);
    const temp = path.join(path.dirname(target), `.${path.basename(target)}.${crypto.randomUUID()}.tmp`);
    try {
      fs.writeFileSync(temp, nextBytes, { flag: 'wx', mode: 0o600 });
      fs.renameSync(temp, target);
    } finally {
      fs.rmSync(temp, { force: true });
    }
    const hash = bytesHash(nextBytes);
    return { path: vfsPath, hash, version: hash, size: nextBytes.length };
  }

  async append(vfsPath, bytes, precondition = {}) {
    const current = await this.read(vfsPath);
    checkPrecondition(current, precondition);
    const combined = Buffer.concat([current?.bytes || Buffer.alloc(0), asBuffer(bytes)]);
    return this.writeAtomic(vfsPath, combined, current ? { version: current.version } : { ifAbsent: true });
  }

  async remove(vfsPath, precondition = {}) {
    const target = this.#resolve(vfsPath, { allowMissing: false });
    const current = await this.read(vfsPath);
    checkPrecondition(current, precondition);
    if (!target || !current) return { path: vfsPath, removed: false };
    fs.rmSync(target);
    return { path: vfsPath, removed: true, previous_hash: current.hash };
  }
}

export async function runVfsContract(vfs) {
  const pathName = `contract/${crypto.randomUUID()}.md`;
  const checks = [];
  const record = (name, condition) => checks.push({ name, passed: !!condition });
  record('missing read returns null', await vfs.read(pathName) === null);
  const first = await vfs.writeAtomic(pathName, 'one', { ifAbsent: true });
  record('atomic create returns version', typeof first.version === 'string');
  const read = await vfs.read(pathName);
  record('read preserves bytes', read?.bytes.toString() === 'one');
  let conflict = false;
  try { await vfs.writeAtomic(pathName, 'two', { version: 'wrong' }); } catch (error) { conflict = error instanceof VfsConflictError; }
  record('compare-and-swap rejects stale version', conflict);
  const appended = await vfs.append(pathName, '\ntwo', { version: first.version });
  record('append preserves existing bytes', (await vfs.read(pathName)).bytes.toString() === 'one\ntwo');
  await vfs.remove(pathName, { version: appended.version });
  record('remove deletes target', await vfs.read(pathName) === null);
  let traversal = false;
  try { await vfs.read('../escape.md'); } catch (error) { traversal = error instanceof VfsPathError; }
  record('traversal is rejected', traversal);
  return { passed: checks.every((check) => check.passed), checks };
}
