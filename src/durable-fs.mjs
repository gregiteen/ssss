/**
 * Flush helpers for the reference file adapters (spec §6.3 commit point).
 *
 * A rename is atomic but not durable: after an OS crash the new name can
 * survive while its bytes do not, unless the file is flushed before the
 * rename and the directory after it. Platforms that cannot open a directory
 * for flushing (Windows) skip the directory step.
 */
import fs from 'node:fs';
import path from 'node:path';

const NOFOLLOW = fs.constants.O_NOFOLLOW || 0;
const CREATE_EXCLUSIVE = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NOFOLLOW;
const UNSUPPORTED_DIRECTORY_SYNC = new Set(['EISDIR', 'EINVAL', 'EPERM', 'EACCES', 'ENOTSUP', 'EBADF']);

/** Resolve a file adapter root, optionally without creating any directory. */
export function resolveStorageRoot(root, create = true) {
  if (create) {
    fs.mkdirSync(root, { recursive: true });
    return fs.realpathSync(root);
  }
  const absolute = path.resolve(root);
  let candidate = absolute;
  for (;;) {
    try {
      const real = fs.realpathSync(candidate);
      if (!fs.statSync(real).isDirectory()) throw new Error(`Storage root '${candidate}' must be a directory.`);
      return path.resolve(real, path.relative(candidate, absolute));
    } catch (error) {
      const parent = path.dirname(candidate);
      if (error.code !== 'ENOENT' || parent === candidate || fs.lstatSync(candidate, { throwIfNoEntry: false })?.isSymbolicLink()) throw error;
      candidate = parent;
    }
  }
}

/** Create `file` exclusively, write `bytes`, and flush them before returning. */
export function writeFileSyncDurable(file, bytes, mode = 0o600) {
  const fd = fs.openSync(file, CREATE_EXCLUSIVE, mode);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
}

/** Flush a directory's entries (a rename, create or unlink inside it). */
export function fsyncDirectory(dir) {
  let fd;
  try { fd = fs.openSync(dir, fs.constants.O_RDONLY); }
  catch (error) { if (UNSUPPORTED_DIRECTORY_SYNC.has(error.code)) return; throw error; }
  try { fs.fsyncSync(fd); }
  catch (error) { if (!UNSUPPORTED_DIRECTORY_SYNC.has(error.code)) throw error; }
  finally { fs.closeSync(fd); }
}
