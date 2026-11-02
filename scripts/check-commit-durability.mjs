/**
 * Commit durability checks (spec §6.3, §6.4, §8.1): a committed key is never
 * executed twice, and the vault and event log agree after a crash.
 * Crash cases kill real child processes; nothing here is simulated in-process.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createKernel } from '../src/kernel.mjs';
import { createEngine } from '../src/engine.mjs';
import { FileSystemVfs, MemoryVfs } from '../src/vfs.mjs';
import { JsonlEventStore, MemoryEventStore, createCanonicalEvent } from '../src/events.mjs';
import { FileIdempotencyStore, MemoryIdempotencyStore } from '../src/idempotency.mjs';
import { contentHash, importBundle, provisionBundle } from '../src/bundle.mjs';
import { FileIntentJournal, MemoryIntentJournal, runIntentJournalContract } from '../src/intents.mjs';

const REGISTRY_DIR = fileURLToPath(new URL('../registry', import.meta.url));
const SRC = (file) => new URL(`../src/${file}`, import.meta.url).href;

const checks = [];
const check = (name, passed, detail = '') => checks.push({ name, passed: !!passed, detail });

const allow = async () => ({ allowed: true });
const principal = { id: 'durability', kind: 'service' };
const context = { principal };
const runDoc = (title) => [
  '---', 'type: run', `title: ${title}`, 'description: Durability check run.', 'run_id: r1', 'workflow_id: w1',
  'status: running', 'timestamp: 2026-10-31T00:00:00Z', '---', '# Log', '',
].join('\n');
const create = (key, file, title = 'created') => ({ type: 'operation', workspace_id: 'ws', idempotency_key: key, path: file, content: runDoc(title) });
// `run` is append-only; replace and delete cases use a replaceable `rule`.
const ruleDoc = (name) => [
  '---', 'type: rule', `name: ${name}`, `title: ${name}`, 'description: Durability check rule.', 'timestamp: 2026-10-31T00:00:00Z', '---', `# ${name}`, '',
].join('\n');
const put = (key, file, name) => ({ type: 'operation', workspace_id: 'ws', idempotency_key: key, path: file, content: ruleDoc(name) });
const append = (key, file, line) => ({ type: 'patch', workspace_id: 'ws', idempotency_key: key, path: file, patches: { __body__: line } });
const occurrences = (text, needle) => text.split(needle).length - 1;

async function eventsFor(store, key) {
  const found = [];
  for await (const { event } of store.replay({ workspaceId: 'ws' })) if (event.idempotency_key === key) found.push(event);
  return found;
}

async function checkLostRecord() {
  const vfs = new MemoryVfs(), eventStore = new MemoryEventStore(), cache = new MemoryIdempotencyStore();
  let failNextPut = false;
  const flaky = {
    get: (...args) => cache.get(...args),
    put: async (...args) => { if (failNextPut) { failNextPut = false; throw new Error('ENOSPC'); } return cache.put(...args); },
  };
  const kernel = createKernel({ vfs, eventStore, idempotencyStore: flaky, authorize: allow });
  await kernel.execute(create('lost-create', 'runs/lost.md'), context);
  failNextPut = true;
  const first = await kernel.execute(append('lost-1', 'runs/lost.md', 'step one'), context);
  const retry = await kernel.execute(append('lost-1', 'runs/lost.md', 'step one'), context);
  const body = (await vfs.read('runs/lost.md')).bytes.toString();
  check('a retry after a lost idempotency record replays from the event log',
    first.success && retry.replay === true && retry.event_id === first.event_id, JSON.stringify(retry));
  check('a retry after a lost idempotency record applies the append once',
    occurrences(body, 'step one') === 1 && (await eventsFor(eventStore, 'lost-1')).length === 1);
}

async function checkExpiredRecord(root) {
  const vault = path.join(root, 'vault');
  const kernelWith = (cacheDir) => createKernel({
    vfs: new FileSystemVfs(vault), eventStore: new JsonlEventStore(path.join(vault, '.events')),
    idempotencyStore: new FileIdempotencyStore(path.join(root, cacheDir)), authorize: allow,
  });
  const before = kernelWith('cache-a');
  await before.execute(create('exp-create', 'runs/expired.md'), context);
  const first = await before.execute(append('exp-1', 'runs/expired.md', 'step one'), context);
  // A different cache directory is a cache whose entries have all expired.
  const after = kernelWith('cache-b');
  const retry = await after.execute(append('exp-1', 'runs/expired.md', 'step one'), context);
  const conflict = await after.execute(append('exp-1', 'runs/expired.md', 'something else'), context);
  const body = fs.readFileSync(path.join(vault, 'runs/expired.md'), 'utf8');
  check('a retry after the idempotency record expired replays the commit',
    retry.replay === true && retry.event_id === first.event_id && occurrences(body, 'step one') === 1, JSON.stringify(retry));
  check('a replay from the log matches the original response',
    retry.operation_id === first.operation_id && retry.committed_at === first.committed_at
      && retry.validation.type === first.validation.type && retry.type === 'patch' && retry.path === 'runs/expired.md');
  check('a replay from the log backfills the idempotency cache',
    (await new FileIdempotencyStore(path.join(root, 'cache-b')).get('ws', 'exp-1'))?.request_hash === (await new FileIdempotencyStore(path.join(root, 'cache-a')).get('ws', 'exp-1'))?.request_hash);
  check('reusing an expired key for a different request is a conflict', conflict.error?.code === 'idempotency_conflict', JSON.stringify(conflict.error));
}

async function checkReplayAfterLocalEdit() {
  const vfs = new MemoryVfs(), eventStore = new MemoryEventStore();
  const before = createKernel({ vfs, eventStore, authorize: allow });
  await before.execute(put('import-v1', 'rules/imported.md', 'v1'), context);
  await before.execute(put('local-edit', 'rules/imported.md', 'v2 local edit'), context);
  // A new kernel has an empty cache: every record has expired.
  const replay = await createKernel({ vfs, eventStore, authorize: allow }).execute(put('import-v1', 'rules/imported.md', 'v1'), context);
  check('replaying an imported key after expiry does not revert a later edit',
    replay.replay === true && (await vfs.read('rules/imported.md')).bytes.toString() === ruleDoc('v2 local edit'), JSON.stringify(replay));
}

async function checkSeparateEngines(root) {
  const vault = path.join(root, 'engine');
  const envelope = (extra) => ({ workspace_id: 'ws', actor: { role: 'system' }, ...extra });
  await createEngine().processOperation(envelope(create('eng-create', 'runs/engine.md')), vault);
  const first = await createEngine().processOperation(envelope(append('eng-1', 'runs/engine.md', 'step one')), vault);
  const second = await createEngine().processOperation(envelope(append('eng-1', 'runs/engine.md', 'step one')), vault);
  const body = fs.readFileSync(path.join(vault, 'runs/engine.md'), 'utf8');
  check('a second engine instance replays a key the first committed',
    first.success && second.replay === true && occurrences(body, 'step one') === 1, JSON.stringify(second));
}

async function checkJsonlLookup(root) {
  const make = (key, extra = {}) => createCanonicalEvent({
    workspace_id: 'ws', action: 'event', subject: 'lookup', principal, operation_id: `op-${key}`,
    idempotency_key: key, request_hash: `sha256:${key}`, payload: { pad: 'x'.repeat(200) }, ...extra,
  });
  const store = new JsonlEventStore(path.join(root, 'lookup'));
  await store.append(make('first-key'));
  const duplicate = make('first-key', { operation_id: 'op-again' });
  await store.append(duplicate);
  check('event store lookup returns the first event recorded under a key',
    (await store.findByIdempotencyKey('ws', 'first-key'))?.operation_id === 'op-first-key');
  check('event store lookup returns null for an unknown key', (await store.findByIdempotencyKey('ws', 'missing')) === null);
  check('event store lookup is scoped to the workspace', (await store.findByIdempotencyKey('other', 'first-key')) === null);

  const child = spawnSync(process.execPath, ['--input-type=module', '-e', [
    `import { JsonlEventStore, createCanonicalEvent } from ${JSON.stringify(SRC('events.mjs'))};`,
    `await new JsonlEventStore(${JSON.stringify(path.join(root, 'lookup'))}).append(createCanonicalEvent(${JSON.stringify({
      workspace_id: 'ws', action: 'event', subject: 'lookup', principal, operation_id: 'op-child', idempotency_key: 'child-key', request_hash: 'sha256:child',
    })}));`,
  ].join('\n')], { encoding: 'utf8' });
  check('event store lookup finds a key another process appended',
    child.status === 0 && (await store.findByIdempotencyKey('ws', 'child-key'))?.operation_id === 'op-child', child.stderr);

  const rotating = new JsonlEventStore(path.join(root, 'rotating'), { maxBytes: 800 });
  for (let index = 0; index < 8; index++) await rotating.append(make(`rot-${index}`));
  const segments = fs.readdirSync(path.join(root, 'rotating')).filter((name) => /^ws\.\d+\.jsonl$/.test(name));
  const fresh = new JsonlEventStore(path.join(root, 'rotating'), { maxBytes: 800 });
  check('event store lookup finds keys in rotated archives',
    segments.length > 1 && (await fresh.findByIdempotencyKey('ws', 'rot-0'))?.operation_id === 'op-rot-0'
      && (await rotating.findByIdempotencyKey('ws', 'rot-7'))?.operation_id === 'op-rot-7', `segments=${segments.length}`);

  // Another writer's line in flight: complete lines stay findable, and the
  // append path still refuses to write after bytes it cannot parse.
  const live = path.join(root, 'lookup', 'ws.jsonl');
  const pending = JSON.stringify(make('pending-key'));
  fs.appendFileSync(live, pending.slice(0, 40));
  const midWrite = await store.findByIdempotencyKey('ws', 'first-key');
  const appendRefused = await store.append(make('after-partial')).then(() => false, (error) => error instanceof SyntaxError);
  fs.appendFileSync(live, `${pending.slice(40)}\n`);
  check('event store lookup tolerates another writer\'s line in flight',
    midWrite?.operation_id === 'op-first-key' && appendRefused && (await store.findByIdempotencyKey('ws', 'pending-key'))?.operation_id === 'op-pending-key');

  const memory = new MemoryEventStore();
  await memory.append(make('mem-key'));
  await memory.append(make('mem-key', { operation_id: 'op-mem-again' }));
  check('memory event store lookup returns the first event recorded under a key',
    (await memory.findByIdempotencyKey('ws', 'mem-key'))?.operation_id === 'op-mem-key' && (await memory.findByIdempotencyKey('ws', 'nope')) === null);
}

async function checkBundleReimport(root) {
  const bundle = JSON.parse(fs.readFileSync(new URL('../conformance/reference-bundle.ucw.json', import.meta.url), 'utf8'));
  const options = { workspaceId: 'ws-conf', parameters: { business_name: 'Demo', domain: 'demo.example' } };
  const vault = path.join(root, 'bundle');
  const first = await importBundle(provisionBundle(bundle, options).plan, vault, createEngine({ registryDir: REGISTRY_DIR }));
  const changed = structuredClone(bundle);
  const target = changed.files.find((file) => file.path === 'assistants/concierge.md');
  target.content = `${target.content.replace(/\s+$/, '')}\n\nUpdated in a later bundle version.\n`;
  changed.manifest.provenance.content_hash = contentHash(changed.files);
  if (changed.manifest.dependencies?.integrity) changed.manifest.dependencies.integrity.content_hash = changed.manifest.provenance.content_hash;
  const provisioned = provisionBundle(changed, options);
  const { plan } = provisioned;
  const updated = await importBundle(plan, vault, createEngine({ registryDir: REGISTRY_DIR }));
  const again = await importBundle(plan, vault, createEngine({ registryDir: REGISTRY_DIR }));
  check('re-importing a changed bundle commits the changed file',
    first.ok && provisioned.ok && updated.ok && updated.committed === 1,
    JSON.stringify({ provision: provisioned.errors, committed: updated.committed, failed: updated.results.filter((result) => !result.success).map((result) => result.error) }));
  check('re-importing an identical bundle from a new engine commits nothing', again.ok && again.committed === 0, `committed=${again.committed}`);
}

const fileKernel = (vault) => createKernel({
  vfs: new FileSystemVfs(vault), eventStore: new JsonlEventStore(path.join(vault, '.events')), authorize: allow,
});
const read = (vault, file) => (fs.existsSync(path.join(vault, file)) ? fs.readFileSync(path.join(vault, file), 'utf8') : null);
const intentFiles = (vault) => {
  const dir = path.join(vault, '.ssss-intents');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith('.json')) : [];
};

// A child process that runs one envelope through a filesystem kernel and dies
// with SIGKILL at a chosen point: `before` the event append, `after` it, or
// `hang` inside it (printing READY) until the parent kills it.
function childScript(vault, envelope, mode) {
  return [
    `import { createKernel } from ${JSON.stringify(SRC('kernel.mjs'))};`,
    `import { FileSystemVfs } from ${JSON.stringify(SRC('vfs.mjs'))};`,
    `import { JsonlEventStore } from ${JSON.stringify(SRC('events.mjs'))};`,
    `const real = new JsonlEventStore(${JSON.stringify(path.join(vault, '.events'))});`,
    `const mode = ${JSON.stringify(mode)};`,
    'const eventStore = {',
    '  findByIdempotencyKey: (...args) => real.findByIdempotencyKey(...args),',
    '  replay: (options) => real.replay(options),',
    '  async append(event) {',
    "    if (mode === 'before') process.kill(process.pid, 'SIGKILL');",
    "    if (mode === 'after') { await real.append(event); process.kill(process.pid, 'SIGKILL'); }",
    "    if (mode === 'hang') { console.log('READY'); await new Promise(() => {}); }",
    '    return real.append(event);',
    '  },',
    '};',
    `const kernel = createKernel({ vfs: new FileSystemVfs(${JSON.stringify(vault)}), eventStore, authorize: async () => ({ allowed: true }) });`,
    `await kernel.execute(${JSON.stringify(envelope)}, { principal: ${JSON.stringify(principal)} });`,
    "console.log('SURVIVED');",
  ].join('\n');
}

function crashIn(vault, envelope, mode) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', childScript(vault, envelope, mode)], { encoding: 'utf8' });
}

function hangIn(vault, envelope) {
  const child = spawn(process.execPath, ['--input-type=module', '-e', childScript(vault, envelope, 'hang')]);
  const ready = new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; if (out.includes('READY')) resolve(); });
    child.on('exit', () => reject(new Error(`child exited before READY: ${out}`)));
  });
  const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve(signal)));
  return { child, ready, exited };
}

async function checkCrashRecovery(root) {
  const vault = path.join(root, 'crash');
  const setup = fileKernel(vault);
  for (const file of ['rules/replace.md', 'rules/delete.md', 'rules/after.md']) {
    const setupResult = await setup.execute(put(`setup-${file}`, file, 'original'), context);
    if (!setupResult.success) throw new Error(`setup failed: ${JSON.stringify(setupResult.error)}`);
  }
  await setup.execute(create('setup-patch', 'runs/patch.md', 'original'), context);

  const cases = [
    { name: 'create', file: 'rules/created.md', envelope: put('crash-create', 'rules/created.md', 'never committed'), expected: null },
    { name: 'replace', file: 'rules/replace.md', envelope: put('crash-replace', 'rules/replace.md', 'never committed'), expected: read(vault, 'rules/replace.md') },
    { name: 'patch', file: 'runs/patch.md', envelope: append('crash-patch', 'runs/patch.md', 'never committed'), expected: read(vault, 'runs/patch.md') },
    { name: 'delete', file: 'rules/delete.md', envelope: { type: 'delete', workspace_id: 'ws', idempotency_key: 'crash-delete', path: 'rules/delete.md' }, expected: read(vault, 'rules/delete.md') },
  ];
  // One case at a time: a crashing child's own first operation would
  // otherwise recover the previous child's crash before the parent looks.
  const events = new JsonlEventStore(path.join(vault, '.events'));
  for (const item of cases) {
    const result = crashIn(vault, item.envelope, 'before');
    item.killed = result.signal === 'SIGKILL';
    item.orphaned = read(vault, item.file) !== item.expected;
    const recovered = await fileKernel(vault).recover();
    item.outcome = recovered.find((entry) => entry.path === item.file)?.outcome;
    item.restored = read(vault, item.file) === item.expected;
    item.noEvent = !(await events.findByIdempotencyKey('ws', item.envelope.idempotency_key));
  }
  check('a SIGKILL between the VFS write and the event append leaves uncommitted state (reproduced)',
    cases.every((item) => item.killed && item.orphaned), JSON.stringify(cases.map(({ name, killed, orphaned }) => ({ name, killed, orphaned }))));
  for (const item of cases) {
    check(`recovery rolls back a crashed ${item.name}`, item.outcome === 'rolled_back' && item.restored && item.noEvent,
      JSON.stringify({ outcome: item.outcome, restored: item.restored, noEvent: item.noEvent }));
  }
  check('recovery leaves no intent behind', intentFiles(vault).length === 0, JSON.stringify(intentFiles(vault)));

  const committedLate = crashIn(vault, put('crash-after', 'rules/after.md', 'committed before the crash'), 'after');
  const afterRecovery = await fileKernel(vault).recover();
  const retried = await fileKernel(vault).execute(put('crash-after', 'rules/after.md', 'committed before the crash'), context);
  check('a crash after the event append keeps the commit',
    committedLate.signal === 'SIGKILL' && afterRecovery.find((entry) => entry.path === 'rules/after.md')?.outcome === 'committed'
      && read(vault, 'rules/after.md').includes('committed before the crash') && retried.replay === true,
    JSON.stringify({ afterRecovery, retried: retried.error || retried.replay }));
}

async function checkRecoveryTriggers(root) {
  // A kernel's first operation recovers the whole vault, even other paths.
  const vault = path.join(root, 'first-op');
  await fileKernel(vault).execute(put('first-setup', 'rules/one.md', 'original'), context);
  const original = read(vault, 'rules/one.md');
  crashIn(vault, put('first-crash', 'rules/one.md', 'never committed'), 'before');
  const orphaned = read(vault, 'rules/one.md') !== original;
  await fileKernel(vault).execute(put('first-other', 'rules/two.md', 'unrelated'), context);
  check('a kernel\'s first operation rolls back a crashed write on another path', orphaned && read(vault, 'rules/one.md') === original);

  // A kernel already past its first operation resolves the leftover when it
  // next commits on that path. It read the uncommitted state, so its first
  // attempt loses the compare-and-swap; the retry commits on the real base.
  const busy = path.join(root, 'next-commit');
  const kernel = fileKernel(busy);
  await kernel.execute(create('busy-setup', 'runs/log.md', 'original'), context);
  crashIn(busy, append('busy-crash', 'runs/log.md', 'never committed'), 'before');
  const stale = await kernel.execute(append('busy-1', 'runs/log.md', 'real step'), context);
  const retry = await kernel.execute(append('busy-1', 'runs/log.md', 'real step'), context);
  const body = read(busy, 'runs/log.md');
  check('the next commit on a crashed path rolls the leftover back first',
    stale.error?.code === 'version_conflict' && retry.success && !retry.replay && !body.includes('never committed') && occurrences(body, 'real step') === 1,
    JSON.stringify({ stale: stale.error, retry: retry.error || retry.success }));

  // A live writer's intent is never touched; once it is killed, it is.
  const live = path.join(root, 'live');
  await fileKernel(live).execute(put('live-setup', 'rules/live.md', 'original'), context);
  const before = read(live, 'rules/live.md');
  const holder = hangIn(live, put('live-hang', 'rules/live.md', 'in flight'));
  await holder.ready;
  const whileAlive = await fileKernel(live).recover();
  const untouched = read(live, 'rules/live.md').includes('in flight');
  holder.child.kill('SIGKILL');
  const signal = await holder.exited;
  const afterKill = await fileKernel(live).recover();
  check('recovery skips an intent whose writer is alive',
    whileAlive.length === 1 && whileAlive[0].outcome === 'in_flight' && untouched, JSON.stringify(whileAlive));
  check('recovery rolls back the same intent once its writer is killed',
    signal === 'SIGKILL' && afterKill[0]?.outcome === 'rolled_back' && read(live, 'rules/live.md') === before, JSON.stringify(afterKill));

  // A document changed outside the kernel after a crash is reported, not overwritten.
  const external = path.join(root, 'external');
  await fileKernel(external).execute(put('ext-setup', 'rules/ext.md', 'original'), context);
  crashIn(external, put('ext-crash', 'rules/ext.md', 'never committed'), 'before');
  fs.writeFileSync(path.join(external, 'rules/ext.md'), ruleDoc('edited by hand'));
  const conflict = await fileKernel(external).recover();
  const quarantined = conflict[0]?.quarantined && fs.existsSync(path.join(external, '.ssss-intents', conflict[0].quarantined));
  const keptExternal = read(external, 'rules/ext.md') === ruleDoc('edited by hand');
  const writable = await fileKernel(external).execute(put('ext-after', 'rules/ext.md', 'later write'), context);
  check('recovery reports an external write as a conflict and keeps the evidence',
    conflict[0]?.outcome === 'conflict' && quarantined && keptExternal && intentFiles(external).length === 0,
    JSON.stringify(conflict));
  check('a path whose intent was quarantined stays writable', writable.success, JSON.stringify(writable.error));

  const engineVault = path.join(root, 'engine-recover');
  await createEngine().processOperation({ ...put('eng-setup', 'rules/e.md', 'original'), actor: { role: 'system' } }, engineVault);
  const engineOriginal = read(engineVault, 'rules/e.md');
  crashIn(engineVault, put('eng-crash', 'rules/e.md', 'never committed'), 'before');
  const engineRecovered = await createEngine().recover(engineVault);
  check('the engine façade recovers a crashed write', engineRecovered[0]?.outcome === 'rolled_back' && read(engineVault, 'rules/e.md') === engineOriginal, JSON.stringify(engineRecovered));
}

async function checkFlushOrder(root) {
  const vault = path.join(root, 'flush');
  const kernel = fileKernel(vault);
  await kernel.execute(create('flush-setup', 'runs/setup.md'), context);
  const original = { openSync: fs.openSync, closeSync: fs.closeSync, fsyncSync: fs.fsyncSync };
  const paths = new Map(), flushed = [];
  fs.openSync = (target, ...rest) => { const fd = original.openSync(target, ...rest); paths.set(fd, String(target)); return fd; };
  fs.closeSync = (fd) => { paths.delete(fd); return original.closeSync(fd); };
  fs.fsyncSync = (fd) => { flushed.push(paths.get(fd) || `fd:${fd}`); return original.fsyncSync(fd); };
  let result;
  try { result = await kernel.execute(create('flush-1', 'runs/flushed.md'), context); }
  finally { Object.assign(fs, original); }
  const first = (test) => flushed.findIndex(test);
  const intentFile = first((file) => file.includes('.ssss-intents') && file.endsWith('.tmp'));
  const intentDir = first((file) => file.endsWith('.ssss-intents'));
  const documentFile = first((file) => file.includes(`${path.sep}runs${path.sep}.flushed.md.`));
  const documentDir = first((file) => file.endsWith(`${path.sep}runs`));
  const eventLog = first((file) => file.endsWith('ws.jsonl'));
  check('a filesystem commit flushes the intent, then the document, then the event',
    result.success && intentFile >= 0 && intentFile < intentDir && intentDir < documentFile && documentFile < documentDir && documentDir < eventLog,
    JSON.stringify(flushed.map((file) => path.relative(vault, file))));
}

// A section that throws is a failed check, so one crash cannot hide the rest.
async function section(name, fn) {
  try { await fn(); } catch (error) { check(`${name} completes`, false, error.stack || error.message); }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-durability-'));
try {
  await section('lost record', () => checkLostRecord());
  await section('expired record', () => checkExpiredRecord(path.join(root, 'expired')));
  await section('replay after a local edit', () => checkReplayAfterLocalEdit());
  await section('separate engines', () => checkSeparateEngines(root));
  await section('event store lookup', () => checkJsonlLookup(root));
  await section('bundle re-import', () => checkBundleReimport(root));
  await section('crash recovery', () => checkCrashRecovery(root));
  await section('recovery triggers', () => checkRecoveryTriggers(root));
  await section('flush order', () => checkFlushOrder(root));
  await section('intent journal contracts', async () => {
    for (const [name, journal] of [['memory', new MemoryIntentJournal()], ['filesystem', new FileIntentJournal(path.join(root, 'journal'))]]) {
      const contract = await runIntentJournalContract(journal);
      check(`${name} intent journal passes the shared contract`, contract.passed, JSON.stringify(contract.checks.filter((item) => !item.passed)));
    }
  });
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

let passed = 0;
for (const item of checks) {
  if (item.passed) { passed++; console.log(`  ✅ ${item.name}`); }
  else console.log(`  ❌ ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
}
console.log(`\n  ${passed}/${checks.length} commit durability checks passed (§6.3/§6.4/§8.1)`);
if (passed !== checks.length) process.exitCode = 1;
