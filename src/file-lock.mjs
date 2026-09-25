/**
 * Cross-process exclusive lock files for the reference file adapters.
 *
 * A lock is a file created with O_EXCL and removed by its holder. A lock left
 * behind by a crashed holder is broken once the holder is known to be dead
 * (same host, process gone) or the lock is older than `staleMs`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const NOFOLLOW = fs.constants.O_NOFOLLOW || 0;
const CREATE_EXCLUSIVE = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NOFOLLOW;
const HOST = os.hostname();

export const FILE_LOCK_DEFAULTS = Object.freeze({ timeoutMs: 40_000, staleMs: 30_000 });

export class FileLockTimeoutError extends Error {
  constructor(lockPath) {
    super(`Timed out waiting for lock '${path.basename(lockPath)}'.`);
    this.name = 'FileLockTimeoutError';
    this.code = 'SSSS_LOCK_TIMEOUT';
  }
}

function notRegular(lockPath) {
  return new Error(`Lock '${path.basename(lockPath)}' is not a regular file.`);
}

function readHolder(lockPath) {
  try {
    const fd = fs.openSync(lockPath, fs.constants.O_RDONLY | NOFOLLOW);
    try { return JSON.parse(fs.readFileSync(fd, 'utf8')); } finally { fs.closeSync(fd); }
  } catch { return null; }
}

function holderIsDead(holder) {
  if (holder?.host !== HOST || !Number.isInteger(holder.pid) || holder.pid === process.pid) return false;
  try { process.kill(holder.pid, 0); return false; }
  catch (error) { return error.code === 'ESRCH'; }
}

const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino && a.mtimeMs === b.mtimeMs;

/** Create the lock and return its stat (proof of ownership), or null when it is held. */
function tryAcquire(lockPath, createDir) {
  let fd;
  try { fd = fs.openSync(lockPath, CREATE_EXCLUSIVE, 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') return null;
    if (error.code === 'ELOOP') throw notRegular(lockPath);
    if (error.code === 'ENOENT' && createDir) {
      fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
      return tryAcquire(lockPath, false);
    }
    throw error;
  }
  try {
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, host: HOST, acquired_at: new Date().toISOString() }));
    return fs.fstatSync(fd);
  } catch (error) {
    fs.rmSync(lockPath, { force: true });
    throw error;
  } finally { fs.closeSync(fd); }
}

function breakIfStale(lockPath, staleMs) {
  let stat;
  try { stat = fs.lstatSync(lockPath); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (!stat.isFile()) throw notRegular(lockPath);
  if (Date.now() - stat.mtimeMs < staleMs && !holderIsDead(readHolder(lockPath))) return;
  // Move the lock aside so only one breaker wins. If a live holder replaced it
  // after the stat above, the moved file is a different inode: put it back.
  const aside = `${lockPath}.${crypto.randomUUID()}.stale`;
  try { fs.renameSync(lockPath, aside); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  const moved = fs.lstatSync(aside);
  if (moved.ino !== stat.ino || moved.dev !== stat.dev) {
    try { fs.linkSync(aside, lockPath); } catch {}
  }
  fs.rmSync(aside, { force: true });
}

// Remove the lock only if it is still the file we created; a lock broken as
// stale and re-taken by another holder is a different file.
function release(lockPath, owned) {
  try {
    if (sameFile(fs.lstatSync(lockPath), owned)) fs.unlinkSync(lockPath);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

/**
 * Run `fn` while holding the lock file at `lockPath`. With `createDir`, the
 * lock's directory is created (mode 0700) when it is missing.
 */
export async function withFileLock(lockPath, fn, options = {}) {
  const timeoutMs = options.timeoutMs ?? FILE_LOCK_DEFAULTS.timeoutMs;
  const staleMs = options.staleMs ?? FILE_LOCK_DEFAULTS.staleMs;
  const deadline = Date.now() + timeoutMs;
  let owned = tryAcquire(lockPath, options.createDir);
  for (let delay = 1; !owned; delay = Math.min(delay * 2, 50)) {
    breakIfStale(lockPath, staleMs);
    owned = tryAcquire(lockPath, options.createDir);
    if (owned) break;
    if (Date.now() >= deadline) throw new FileLockTimeoutError(lockPath);
    await new Promise((resolve) => setTimeout(resolve, delay * (1 + Math.random())));
  }
  try { return await fn(); }
  finally { release(lockPath, owned); }
}
