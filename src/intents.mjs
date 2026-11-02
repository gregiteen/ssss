/**
 * Commit intent journals (spec §6.3): a rollback journal for the window
 * between the VFS commit (stage 9) and the event append (stage 10).
 *
 * Before stage 9 the kernel records an intent holding the document's prior
 * content and holds the path's commit lock until stage 10 ends. An intent
 * still present when its lock is free belongs to a writer that died; the
 * kernel resolves it from the event log and the vault before the next commit
 * on that path. A live holder's intent is never touched.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { withFileLock } from './file-lock.mjs';
import { fsyncDirectory, writeFileSyncDurable } from './durable-fs.mjs';

/**
 * Commit locks wait like other file locks, but count as stale only after five
 * minutes, far beyond the longest in-flight commit (two 40 s lock waits), so
 * recovery can never roll back a commit that is still running. A holder that
 * has exited on this host is detected at once.
 */
export const INTENT_LOCK_DEFAULTS = Object.freeze({ timeoutMs: 40_000, staleMs: 5 * 60_000 });

/** Outcomes a resolver may return. `failed` keeps the intent for a later attempt. */
export const INTENT_OUTCOMES = Object.freeze(['committed', 'rolled_back', 'discarded', 'conflict', 'failed']);

/**
 * In-process journal: serializes commits per path. Memory state cannot outlive
 * a crash, so the only leftovers are intents a commit kept after its own
 * rollback failed; those are resolved before the next commit on the path.
 */
export class MemoryIntentJournal {
  #tails = new Map();
  #intents = new Map();
  #held = new Set();

  async run(vfsPath, intent, commit, { resolve }) {
    const previous = this.#tails.get(vfsPath) || Promise.resolve();
    let release;
    const tail = previous.then(() => new Promise((done) => { release = done; }));
    this.#tails.set(vfsPath, tail);
    await previous;
    this.#held.add(vfsPath);
    try {
      const leftover = this.#intents.get(vfsPath);
      if (leftover) {
        const settled = await resolve(structuredClone(leftover));
        if (settled.outcome === 'failed') throw new Error(`Recovery of an earlier commit on '${vfsPath}' failed: ${settled.reason}`);
        this.#intents.delete(vfsPath);
      }
      this.#intents.set(vfsPath, structuredClone(intent));
      const result = await commit();
      if (!result?.keepIntent) this.#intents.delete(vfsPath);
      return result;
    } finally {
      this.#held.delete(vfsPath);
      release();
      if (this.#tails.get(vfsPath) === tail) this.#tails.delete(vfsPath);
    }
  }

  async recover(resolve) {
    const results = [];
    for (const [vfsPath, intent] of [...this.#intents]) {
      if (this.#held.has(vfsPath)) { results.push({ path: vfsPath, operation_id: intent.operation_id, outcome: 'in_flight' }); continue; }
      const settled = await resolve(structuredClone(intent));
      if (settled.outcome !== 'failed') this.#intents.delete(vfsPath);
      results.push({ path: vfsPath, operation_id: intent.operation_id, ...settled });
    }
    return results;
  }
}

const INTENT_FILE = /^[a-f0-9]{64}\.json$/;

/**
 * File-backed journal, one intent and one lock per path under `root`. Intents
 * are written to a flushed temp file and renamed, so a reader sees a complete
 * intent or none. Unresolvable intents move to `root/unresolved/`.
 */
export class FileIntentJournal {
  constructor(root, options = {}) {
    if (!root) throw new Error('FileIntentJournal requires a root directory.');
    this.root = path.resolve(root);
    this.lockOptions = { ...INTENT_LOCK_DEFAULTS, ...options.lock };
  }

  #checkRoot({ create }) {
    let stat = null;
    try { stat = fs.lstatSync(this.root); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) throw new Error('Intent journal root must be a real directory.');
    if (!stat && create) fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    return !!stat || create;
  }

  #files(name) {
    return { intent: path.join(this.root, `${name}.json`), lock: path.join(this.root, `${name}.lock`) };
  }

  #name(vfsPath) { return crypto.createHash('sha256').update(vfsPath).digest('hex'); }

  #read(file) {
    let stat;
    try { stat = fs.lstatSync(file); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    if (!stat.isFile()) return { unreadable: true };
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { unreadable: true }; }
  }

  #write(file, intent) {
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    try {
      writeFileSyncDurable(temp, `${JSON.stringify(intent)}\n`);
      fs.renameSync(temp, file);
      fsyncDirectory(this.root);
    } finally { fs.rmSync(temp, { force: true }); }
  }

  #quarantine(file, intent) {
    const dir = path.join(this.root, 'unresolved');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const target = path.join(dir, `${path.basename(file, '.json')}-${intent?.operation_id || crypto.randomUUID()}.json`);
    fs.renameSync(file, target);
    fsyncDirectory(dir);
    return path.relative(this.root, target).split(path.sep).join('/');
  }

  // Caller holds the path's lock. Temp files under the same name belong to a
  // writer that held this lock and died, so they are removed here.
  async #settle(name, resolve) {
    const { intent: file } = this.#files(name);
    for (const entry of fs.readdirSync(this.root)) {
      if (entry.startsWith(`${name}.json.`) && entry.endsWith('.tmp')) fs.rmSync(path.join(this.root, entry), { force: true });
    }
    const leftover = this.#read(file);
    if (!leftover) return null;
    if (leftover.unreadable) {
      return { path: null, operation_id: null, outcome: 'conflict', reason: 'Intent record is unreadable.', quarantined: this.#quarantine(file, null) };
    }
    const settled = await resolve(leftover);
    const result = { path: leftover.path, operation_id: leftover.operation_id, ...settled };
    if (settled.outcome === 'conflict') result.quarantined = this.#quarantine(file, leftover);
    else if (settled.outcome !== 'failed') fs.rmSync(file, { force: true });
    return result;
  }

  async run(vfsPath, intent, commit, { resolve }) {
    this.#checkRoot({ create: true });
    const name = this.#name(vfsPath);
    const { intent: file, lock } = this.#files(name);
    return withFileLock(lock, async () => {
      const settled = await this.#settle(name, resolve);
      if (settled?.outcome === 'failed') throw new Error(`Recovery of an earlier commit on '${vfsPath}' failed: ${settled.reason}`);
      this.#write(file, intent);
      // A throw leaves the intent in place: the commit's state is unknown, and
      // the next recovery decides it from the log and the vault.
      const result = await commit();
      if (!result?.keepIntent) fs.rmSync(file, { force: true });
      return result;
    }, this.lockOptions);
  }

  /**
   * Resolve every intent whose writer is gone. Intents whose lock is held by
   * a live writer are reported as `in_flight` and left alone.
   */
  async recover(resolve) {
    if (!this.#checkRoot({ create: false })) return [];
    const results = [];
    for (const entry of fs.readdirSync(this.root).sort()) {
      if (!INTENT_FILE.test(entry)) continue;
      const name = entry.slice(0, 64);
      const { intent: file, lock } = this.#files(name);
      try {
        const settled = await withFileLock(lock, () => this.#settle(name, resolve), { ...this.lockOptions, timeoutMs: 0 });
        if (settled) results.push(settled);
      } catch (error) {
        if (error.code !== 'SSSS_LOCK_TIMEOUT') throw error;
        const intent = this.#read(file);
        results.push({ path: intent?.path || null, operation_id: intent?.operation_id || null, outcome: 'in_flight' });
      }
    }
    return results;
  }
}

/** Shared contract for intent journals (spec §6.7). */
export async function runIntentJournalContract(journal) {
  const checks = [];
  const record = (name, passed) => checks.push({ name, passed: !!passed });
  const target = `contract/${crypto.randomUUID()}.md`;
  const intent = (id) => ({ version: 1, operation_id: id, path: target });
  const seen = [];
  const resolve = async (leftover) => { seen.push(leftover.operation_id); return { outcome: 'rolled_back' }; };

  const result = await journal.run(target, intent('one'), async () => ({ ok: true }), { resolve });
  record('run returns the commit result', result?.ok === true);
  record('a completed commit leaves nothing to recover', (await journal.recover(resolve)).length === 0 && seen.length === 0);

  await journal.run(target, intent('kept'), async () => ({ keepIntent: true }), { resolve });
  await journal.run(target, intent('next'), async () => ({ ok: true }), { resolve });
  record('a kept intent is resolved before the next commit on its path', seen.join() === 'kept');

  let order = '';
  const slow = journal.run(target, intent('slow'), async () => { order += 'a'; await new Promise((done) => setTimeout(done, 20)); order += 'b'; return {}; }, { resolve });
  const fast = journal.run(target, intent('fast'), async () => { order += 'c'; return {}; }, { resolve });
  await Promise.all([slow, fast]);
  record('commits on one path are serialized', order === 'abc');

  await journal.run(target, intent('stuck'), async () => ({ keepIntent: true }), { resolve });
  const recovered = await journal.recover(resolve);
  record('recover resolves a kept intent and reports it', recovered.length === 1 && recovered[0].outcome === 'rolled_back' && recovered[0].operation_id === 'stuck');
  record('a resolved intent is not resolved again', (await journal.recover(resolve)).length === 0);
  return { passed: checks.every((check) => check.passed), checks };
}
