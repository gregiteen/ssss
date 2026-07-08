#!/usr/bin/env node
/**
 * SSSS conformance runner.
 *
 *   ssss conformance                          structural validation of the fixture set
 *   ssss conformance --endpoint <url> [--token <pat>]   run fixtures against a live host
 *
 * Structural mode (no endpoint) validates that fixtures.json is well-formed and
 * that every fixture is internally consistent with the declared envelope rules —
 * the check that keeps the canonical contract honest. Endpoint mode POSTs each
 * fixture's `request` to a host's Operation Contract endpoint and diffs the
 * response against `expected_response` (spec §12).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createEngine } from '../src/engine.mjs';
import { validateBundle, provisionBundle, importBundle } from '../src/bundle.mjs';
import { parseDocument } from '../src/frontmatter.mjs';
import { createRunEnvelope, planWorkflowTrigger } from '../src/runtime.mjs';
import { auditRegistryFieldUsage } from './audit-registry-field-usage.mjs';
import { validateSkills } from './validate-skills.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '..', 'conformance', 'fixtures.json');
const REFERENCE_BUNDLE = path.resolve(__dirname, '..', 'conformance', 'reference-bundle.ucw.json');
const REGISTRY_DIR = path.resolve(__dirname, '..', 'registry');
const PORTABILITY_CLASSES = ['structural', 'tenant_private', 'resource_bound'];

function parseArgs(argv) {
  const o = { endpoint: null, token: null, engine: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--endpoint') o.endpoint = argv[++i];
    else if (argv[i] === '--token') o.token = argv[++i];
    else if (argv[i] === '--engine') o.engine = true;
  }
  return o;
}

function loadFixtures() {
  if (!fs.existsSync(FIXTURES)) {
    console.error(`❌ No fixtures found at ${FIXTURES}`);
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(FIXTURES, 'utf8'));
  } catch (err) {
    console.error(`❌ fixtures.json is not valid JSON: ${err.message}`);
    process.exit(1);
  }
}

/** Validate the fixture file is internally consistent. Returns an array of problems. */
function validateStructure(doc) {
  const problems = [];
  const envelopeTypes = Object.keys(doc.operation_types || {});
  if (envelopeTypes.length === 0) problems.push('operation_types is empty');
  if (!Array.isArray(doc.fixtures) || doc.fixtures.length === 0) {
    problems.push('fixtures array is empty');
    return problems;
  }
  const seenIds = new Set();
  for (const f of doc.fixtures) {
    const id = f.id || '(no id)';
    if (!f.id) problems.push(`fixture "${f.name || id}" is missing an id`);
    if (seenIds.has(f.id)) problems.push(`duplicate fixture id: ${f.id}`);
    seenIds.add(f.id);
    if (!f.request) { problems.push(`${id}: missing request`); continue; }
    if (!f.expected_response) problems.push(`${id}: missing expected_response`);

    const t = f.request.type;
    // A fixture may deliberately omit `type` to test envelope validation.
    const expectsFailure = f.expected_response && f.expected_response.success === false;
    if (t == null && !expectsFailure) {
      problems.push(`${id}: request has no type but expects success`);
    }
    if (t != null) {
      const spec = doc.operation_types[t];
      if (!spec) {
        problems.push(`${id}: request.type "${t}" not declared in operation_types`);
      } else if (!expectsFailure) {
        for (const rf of spec.required_fields || []) {
          if (f.request[rf] == null) {
            problems.push(`${id}: missing required envelope field "${rf}" for type "${t}"`);
          }
        }
      }
    }
  }
  return problems;
}

/**
 * Validate the primitive registries (§5.5 portability conformance):
 *  - core: every document primitive declares a valid portability class.
 *  - extensions: every document primitive declares a valid class, and no
 *    extension redefines a core type.
 * Returns an array of problems.
 */
function validateRegistry() {
  const problems = [];
  const corePath = path.join(REGISTRY_DIR, 'core.json');
  if (!fs.existsSync(corePath)) return ['registry/core.json not found'];

  let core;
  try { core = JSON.parse(fs.readFileSync(corePath, 'utf8')); }
  catch (err) { return [`registry/core.json is not valid JSON: ${err.message}`]; }

  const coreTypes = Object.keys(core.document_primitives || {});
  for (const [name, def] of Object.entries(core.document_primitives || {})) {
    if (!def.portability) problems.push(`core: "${name}" is missing a portability class`);
    else if (!PORTABILITY_CLASSES.includes(def.portability)) {
      problems.push(`core: "${name}" has invalid portability "${def.portability}"`);
    }
  }
  if (!core.portability || !core.portability.classes) {
    problems.push('core: missing the portability classes definition block');
  }

  const extDir = path.join(REGISTRY_DIR, 'extensions');
  if (fs.existsSync(extDir)) {
    for (const file of fs.readdirSync(extDir).filter((f) => f.endsWith('.json'))) {
      let ext;
      try { ext = JSON.parse(fs.readFileSync(path.join(extDir, file), 'utf8')); }
      catch (err) { problems.push(`extensions/${file}: not valid JSON: ${err.message}`); continue; }
      for (const [name, def] of Object.entries(ext.document_primitives || {})) {
        if (coreTypes.includes(name)) {
          problems.push(`extensions/${file}: redefines core type "${name}" (forbidden)`);
        }
        if (!def.portability) problems.push(`extensions/${file}: "${name}" missing portability class`);
        else if (!PORTABILITY_CLASSES.includes(def.portability)) {
          problems.push(`extensions/${file}: "${name}" invalid portability "${def.portability}"`);
        }
      }
    }
  }
  return problems;
}

/**
 * Run every fixture in-process through the canonical engine against a fresh
 * temp vault. Proves the reference engine satisfies the conformance contract
 * (spec §12) without needing a live host. Fixtures run in array order so that
 * create → patch → delete dependencies resolve.
 */
function runAgainstEngine(doc) {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-vault-'));
  const engine = createEngine();
  let pass = 0, fail = 0;
  try {
    for (const f of doc.fixtures) {
      const want = f.expected_response || {};
      const res = engine.processOperation(f.request, vault);
      const okSuccess = want.success == null || res.success === want.success;
      const wantType = want.validation && want.validation.type;
      const okType = wantType == null || (res.validation && res.validation.type === wantType);
      const okValid = !want.validation || want.validation.valid == null || res.validation.valid === want.validation.valid;
      if (okSuccess && okType && okValid) { pass++; console.log(`  ✅ ${f.id} — ${f.name}`); }
      else {
        fail++;
        console.log(`  ❌ ${f.id} — ${f.name}`);
        console.log(`       want success=${want.success} valid=${want.validation?.valid} type=${wantType}`);
        console.log(`       got  success=${res.success} valid=${res.validation?.valid} type=${res.validation?.type} errors=${JSON.stringify(res.validation?.errors)}`);
      }
    }
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }
  console.log(`\n  ${pass}/${pass + fail} fixtures passed against the reference engine`);
  return fail === 0;
}

/**
 * Bundle/provisioning conformance (spec §16/§17). Validates the reference bundle
 * against the registry schema, then round-trips it through provision → import →
 * re-import against a fresh temp vault to prove:
 *   - the bundle is schema- and hash-valid;
 *   - link integrity holds under id-remap (§17.3);
 *   - import commits every file and is idempotent on re-run (§17.1);
 *   - no `tenant_private` primitive ever lands (the §5.5 keystone).
 * Returns true on full pass.
 */
function runBundleConformance() {
  if (!fs.existsSync(REFERENCE_BUNDLE)) {
    console.log('  ⚠  No reference bundle; run `node scripts/build-reference-bundle.mjs` first.');
    return false;
  }
  const bundle = JSON.parse(fs.readFileSync(REFERENCE_BUNDLE, 'utf8'));
  const checks = [];
  const check = (name, cond, detail = '') => { checks.push({ name, cond, detail }); };

  const { valid, errors } = validateBundle(bundle, { registryDir: REGISTRY_DIR });
  check('reference bundle is schema- and hash-valid', valid, errors.join('; '));
  check('sale profile carries no tenant_private file',
    bundle.files.every((f) => parseDocument(f.content).data.type !== 'task' && parseDocument(f.content).data.type !== 'conversation'));
  check('sale profile reduces resource_bound fields to requirement declarations',
    bundle.files.every((f) => {
      const data = parseDocument(f.content).data;
      if (data.type !== 'domain') return true;
      return data.domain_name === 'REQUIREMENT' && data.registrar === 'REQUIREMENT';
    }));

  const missingFilesBundle = JSON.parse(JSON.stringify(bundle));
  delete missingFilesBundle.files;
  const missingFilesValidation = validateBundle(missingFilesBundle, { registryDir: REGISTRY_DIR });
  check('bundle validation rejects missing files array',
    !missingFilesValidation.valid && missingFilesValidation.errors.some((e) => e.includes('bundle.files must be an array')),
    missingFilesValidation.errors.join('; '));

  const unknownExtensionBundle = JSON.parse(JSON.stringify(bundle));
  unknownExtensionBundle.manifest.required_extensions = ['missing-extension'];
  const unknownExtensionValidation = validateBundle(unknownExtensionBundle, { registryDir: REGISTRY_DIR });
  check('bundle validation rejects unknown required_extensions entries',
    !unknownExtensionValidation.valid && unknownExtensionValidation.errors.some((e) => e.includes("required extension 'missing-extension'")),
    unknownExtensionValidation.errors.join('; '));

  const prov = provisionBundle(bundle, { workspaceId: 'ws-conf', parameters: { business_name: 'Demo', domain: 'demo.example' } });
  check('provision resolves params + link integrity (no dangling [[links]])', prov.ok,
    `unresolved=${JSON.stringify(prov.unresolved)} dangling=${JSON.stringify(prov.danglingLinks)}`);

  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-bundle-'));
  try {
    const engine = createEngine({ registryDir: REGISTRY_DIR });
    const first = importBundle(prov.plan, vault, engine);
    check('import commits every file', first.ok && first.committed === bundle.files.length,
      `ok=${first.ok} committed=${first.committed}/${bundle.files.length}`);

    const second = importBundle(prov.plan, vault, engine);
    check('re-import is idempotent (0 new commits)', second.ok && second.committed === 0,
      `committed=${second.committed}`);

    const landed = fs.existsSync(path.join(vault, 'tasks')) ? fs.readdirSync(path.join(vault, 'tasks')).filter(f => f !== 'index.md') : [];
    check('no tenant_private task file on disk after import', landed.length === 0, `found=${JSON.stringify(landed)}`);
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }

  let pass = 0;
  for (const c of checks) {
    if (c.cond) { pass++; console.log(`  ✅ ${c.name}`); }
    else console.log(`  ❌ ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  }
  console.log(`\n  ${pass}/${checks.length} bundle/provisioning checks passed (§16/§17)`);
  return pass === checks.length;
}

function runOperationContractRegressionConformance() {
  const checks = [];
  const check = (name, cond, detail = '') => { checks.push({ name, cond, detail }); };

  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-op-reg-'));
  const leaseStore = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-lease-'));
  try {
    const engine = createEngine({ registryDir: REGISTRY_DIR, leaseStore });
    const workflowPath = 'workflows/nested.md';
    const createRes = engine.processOperation({
      type: 'operation',
      idempotency_key: 'nested-create',
      workspace_id: 'ws-reg',
      path: workflowPath,
      actor: { role: 'system' },
      content: [
        '---',
        'type: workflow',
        'title: Nested Workflow',
        'description: Exercises nested frontmatter patch serialization.',
        'timestamp: 2026-07-02T00:00:00Z',
        'name: Nested Workflow',
        'triggers:',
        '  - type: cron',
        '    id: morning',
        '    cron: "0 8 * * *"',
        '    timezone: "America/Denver"',
        '---',
        '',
        'Body.',
        '',
      ].join('\n'),
    }, vault);
    check('nested frontmatter fixture commits before patch', createRes.success === true, JSON.stringify(createRes.validation?.errors || []));

    const patchRes = engine.processOperation({
      type: 'patch',
      idempotency_key: 'nested-patch',
      workspace_id: 'ws-reg',
      path: workflowPath,
      actor: { role: 'system' },
      patches: { description: 'Patched without dropping triggers.' },
    }, vault);
    const patched = fs.readFileSync(path.join(vault, workflowPath), 'utf8');
    const patchedData = parseDocument(patched).data;
    check('patch preserves nested frontmatter arrays of maps',
      patchRes.success === true && Array.isArray(patchedData.triggers) && patchedData.triggers[0]?.cron === '0 8 * * *',
      patched);

    const leaseTarget = 'rules/leased.md';
    const leasePathKey = crypto.createHash('sha256').update(leaseTarget).digest('hex');
    const leaseDir = path.join(leaseStore, 'ws-reg');
    fs.mkdirSync(leaseDir, { recursive: true });
    fs.writeFileSync(path.join(leaseDir, `${leasePathKey}.lease.json`), JSON.stringify({
      lease_id: 'lease-ok',
      expires_at: '2999-01-01T00:00:00.000Z',
    }));
    const leasedEnvelope = {
      type: 'operation',
      idempotency_key: 'lease-missing',
      workspace_id: 'ws-reg',
      path: leaseTarget,
      actor: { role: 'system' },
      content: '---\ntype: rule\ntitle: Leased\ndescription: Lease test.\ntimestamp: 2026-07-02T00:00:00Z\nname: Leased\n---\nBody.\n',
    };
    const missingLease = engine.processOperation(leasedEnvelope, vault);
    check('lease conflict rejects missing lease_id', missingLease.success === false && missingLease.validation.errors.some((e) => e.includes('leased')));

    const mismatchLease = engine.processOperation({ ...leasedEnvelope, idempotency_key: 'lease-mismatch', lease_id: 'wrong' }, vault);
    check('lease conflict rejects mismatched lease_id', mismatchLease.success === false && mismatchLease.validation.errors.some((e) => e.includes('Lease mismatch')));

    const matchedLease = engine.processOperation({ ...leasedEnvelope, idempotency_key: 'lease-match', lease_id: 'lease-ok' }, vault);
    check('lease allows matching lease_id', matchedLease.success === true, JSON.stringify(matchedLease.validation?.errors || []));

    const expiredTarget = 'rules/expired.md';
    const expiredPathKey = crypto.createHash('sha256').update(expiredTarget).digest('hex');
    fs.writeFileSync(path.join(leaseDir, `${expiredPathKey}.lease.json`), JSON.stringify({
      lease_id: 'expired',
      expires_at: '2000-01-01T00:00:00.000Z',
    }));
    const expiredLease = engine.processOperation({ ...leasedEnvelope, idempotency_key: 'lease-expired', path: expiredTarget }, vault);
    check('expired lease does not block writes', expiredLease.success === true, JSON.stringify(expiredLease.validation?.errors || []));

    const unreadableTarget = 'rules/unreadable.md';
    const unreadablePathKey = crypto.createHash('sha256').update(unreadableTarget).digest('hex');
    fs.writeFileSync(path.join(leaseDir, `${unreadablePathKey}.lease.json`), '{not json');
    const unreadableLease = engine.processOperation({ ...leasedEnvelope, idempotency_key: 'lease-unreadable', path: unreadableTarget }, vault);
    check('unreadable lease state fails closed', unreadableLease.success === false && unreadableLease.validation.errors.some((e) => e.includes('unreadable')));
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
    fs.rmSync(leaseStore, { recursive: true, force: true });
  }

  let pass = 0;
  for (const c of checks) {
    if (c.cond) { pass++; console.log(`  ✅ ${c.name}`); }
    else console.log(`  ❌ ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  }
  console.log(`\n  ${pass}/${checks.length} operation regression checks passed (§6/§7)`);
  return pass === checks.length;
}

function runCliSmokeConformance() {
  const checks = [];
  const check = (name, cond, detail = '') => { checks.push({ name, cond, detail }); };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-cli-smoke-'));
  try {
    const starter = path.join(tmp, 'starter');
    execFileSync('node', [path.join(__dirname, 'ssss.mjs'), 'new', starter, '--no-git'], { stdio: 'ignore' });
    const vault = path.join(starter, 'vault');
    const files = [];
    (function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(abs);
        else if (entry.name.endsWith('.md')) files.push(abs);
      }
    })(vault);
    const engine = createEngine({ registryDir: REGISTRY_DIR });
    const failures = [];
    for (const abs of files) {
      const rel = path.relative(vault, abs);
      const res = engine.processOperation({
        type: 'operation',
        idempotency_key: `scaffold-${rel.replace(/[^A-Za-z0-9._-]/g, '_')}`,
        workspace_id: 'ws-scaffold',
        path: rel,
        content: fs.readFileSync(abs, 'utf8'),
        dry_run: true,
        actor: { role: 'system' },
      }, vault);
      if (!res.success) failures.push({ rel, errors: res.validation?.errors || [] });
    }
    check('ssss new starter vault files validate against the registry', files.length > 0 && failures.length === 0, JSON.stringify(failures));

    const dryRunVault = path.join(tmp, 'dry-run-vault');
    const dryRunOut = execFileSync('node', [
      path.join(__dirname, 'ssss.mjs'),
      'import',
      REFERENCE_BUNDLE,
      '--vault',
      dryRunVault,
      '--param',
      'business_name=Demo',
      '--param',
      'domain=demo.example',
      '--dry-run',
    ], { encoding: 'utf8' });
    const dryRunFiles = [];
    if (fs.existsSync(dryRunVault)) {
      (function walkDryRun(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const abs = path.join(dir, entry.name);
          if (entry.isDirectory()) walkDryRun(abs);
          else if (entry.isFile()) dryRunFiles.push(abs);
        }
      })(dryRunVault);
    }
    check('ssss import --dry-run reports would-commit counts and leaves target empty',
      dryRunOut.includes('would commit') && dryRunFiles.length === 0,
      dryRunOut.trim());
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  let pass = 0;
  for (const c of checks) {
    if (c.cond) { pass++; console.log(`  ✅ ${c.name}`); }
    else console.log(`  ❌ ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  }
  console.log(`\n  ${pass}/${checks.length} CLI smoke checks passed`);
  return pass === checks.length;
}

/**
 * Runtime conformance (spec §11.8). Proves that a conformant daemon can treat
 * workflow frontmatter as the canonical schedule source, then derive trigger,
 * task, and run envelopes without introducing a scheduler database of record.
 */
function runRuntimeConformance() {
  const checks = [];
  const check = (name, cond, detail = '') => { checks.push({ name, cond, detail }); };

  const workflowPath = 'workflows/daily-digest/WORKFLOW.md';
  const workflowContent = [
    '---',
    'type: workflow',
    'name: "Daily Digest"',
    'priority: 80',
    'triggers:',
    '  - type: cron',
    '    id: daily-0800',
    '    cron: "0 8 * * *"',
    '    timezone: "America/Denver"',
    '    misfire_policy: run_once',
    '    concurrency: skip_if_running',
    'isActive: true',
    '---',
    '',
    '1. Gather unread messages.',
    '2. Summarize.',
    '3. Send the digest.',
    '',
  ].join('\n');

  const trigger = {
    type: 'cron',
    id: 'daily-0800',
    cron: '0 8 * * *',
    timezone: 'America/Denver',
    misfire_policy: 'run_once',
    concurrency: 'skip_if_running',
  };
  const scheduledFor = '2026-07-02T14:00:00.000Z';
  const firstPlan = planWorkflowTrigger({
    workflowPath,
    workflowContent,
    workspaceId: 'TEST_WORKSPACE_ID',
    trigger,
    scheduledFor,
    firedAt: scheduledFor,
  });
  const secondPlan = planWorkflowTrigger({
    workflowPath,
    workflowContent,
    workspaceId: 'TEST_WORKSPACE_ID',
    trigger,
    scheduledFor,
    firedAt: scheduledFor,
  });

  check('same workflow trigger plans the same task path',
    firstPlan.envelopes[1].path === secondPlan.envelopes[1].path,
    `${firstPlan.envelopes[1].path} !== ${secondPlan.envelopes[1].path}`);
  check('same workflow trigger plans the same task idempotency key',
    firstPlan.envelopes[1].idempotency_key === secondPlan.envelopes[1].idempotency_key);
  check('runtime emits event then task envelopes',
    firstPlan.envelopes[0].type === 'event' && firstPlan.envelopes[1].type === 'operation');

  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-runtime-'));
  try {
    const engine = createEngine({ registryDir: REGISTRY_DIR });
    const eventRes = engine.processOperation(firstPlan.envelopes[0], vault);
    const taskRes = engine.processOperation(firstPlan.envelopes[1], vault);
    check('trigger event commits through Operation Contract', eventRes.success === true,
      JSON.stringify(eventRes.validation?.errors || []));
    check('instantiated task commits through Operation Contract', taskRes.success === true,
      JSON.stringify(taskRes.validation?.errors || []));

    const replayEvent = engine.processOperation(secondPlan.envelopes[0], vault);
    const replayTask = engine.processOperation(secondPlan.envelopes[1], vault);
    check('duplicate daemon tick replays trigger event idempotently', replayEvent.replay != null);
    check('duplicate daemon tick replays task write idempotently', replayTask.replay != null);

    const runEnvelope = createRunEnvelope({
      workflowId: firstPlan.workflow_id,
      workspaceId: 'TEST_WORKSPACE_ID',
      taskPath: firstPlan.envelopes[1].path,
      status: 'queued',
      startedAt: scheduledFor,
    });
    const runRes = engine.processOperation(runEnvelope, vault);
    check('worker-created run commits through Operation Contract', runRes.success === true,
      JSON.stringify(runRes.validation?.errors || []));
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }

  let pass = 0;
  for (const c of checks) {
    if (c.cond) { pass++; console.log(`  ✅ ${c.name}`); }
    else console.log(`  ❌ ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  }
  console.log(`\n  ${pass}/${checks.length} runtime checks passed (§11.8)`);
  return pass === checks.length;
}

async function runAgainstEndpoint(doc, opts) {
  const headers = { 'content-type': 'application/json' };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let pass = 0, fail = 0;
  for (const f of doc.fixtures) {
    try {
      const res = await fetch(opts.endpoint, { method: 'POST', headers, body: JSON.stringify(f.request) });
      const body = await res.json().catch(() => ({}));
      const want = f.expected_response || {};
      const okSuccess = want.success == null || body.success === want.success;
      const okStatus = f.expected_http_status == null || res.status === f.expected_http_status;
      if (okSuccess && okStatus) { pass++; console.log(`  ✅ ${f.id} — ${f.name}`); }
      else { fail++; console.log(`  ❌ ${f.id} — ${f.name} (got success=${body.success}, status=${res.status})`); }
    } catch (err) {
      fail++; console.log(`  ❌ ${f.id} — request failed: ${err.message}`);
    }
  }
  console.log(`\n  ${pass}/${pass + fail} fixtures passed against ${opts.endpoint}`);
  return fail === 0;
}

async function main() {
  const opts = parseArgs(process.argv.slice(process.argv.indexOf('conformance') + 1));
  const doc = loadFixtures();
  console.log(`\n=== SSSS Conformance — ${doc.fixtures?.length ?? 0} fixtures (v${doc.version}) ===\n`);

  const problems = validateStructure(doc);
  if (problems.length) {
    console.error('❌ Structural validation failed:');
    for (const p of problems) console.error(`   • ${p}`);
    process.exit(1);
  }
  console.log(`✅ Structure valid: ${doc.fixtures.length} fixtures, envelope types: ${Object.keys(doc.operation_types).join(', ')}`);

  const registryProblems = validateRegistry();
  if (registryProblems.length) {
    console.error('❌ Registry portability validation failed:');
    for (const p of registryProblems) console.error(`   • ${p}`);
    process.exit(1);
  }
  console.log(`✅ Registry valid: every primitive declares a portability class (${PORTABILITY_CLASSES.join(' | ')})`);

  const parityProblems = auditRegistryFieldUsage();
  if (parityProblems.length) {
    console.error('❌ Registry/engine parity audit failed:');
    for (const p of parityProblems) console.error(`   • ${p}`);
    process.exit(1);
  }
  console.log('✅ Registry/engine parity: every enforcement-relevant registry key is referenced in src/engine.mjs.');

  const skillProblems = validateSkills();
  if (skillProblems.length) {
    console.error('❌ Skill conformance failed:');
    for (const p of skillProblems) console.error(`   • ${p}`);
    process.exit(1);
  }
  console.log('✅ Skill conformance: every shipped skill (skills/) validates against the skill primitive and required directory structure.');

  if (opts.endpoint) {
    console.log(`\nRunning against ${opts.endpoint} ...`);
    const ok = await runAgainstEndpoint(doc, opts);
    process.exit(ok ? 0 : 1);
  } else if (opts.engine) {
    console.log('\nRunning fixtures through the reference engine (src/engine.mjs) ...');
    const engineOk = runAgainstEngine(doc);
    console.log('\nRunning workflow runtime conformance (src/runtime.mjs, §11.8) ...');
    const runtimeOk = runRuntimeConformance();
    console.log('\nRunning operation regression conformance (src/engine.mjs, §6/§7) ...');
    const operationRegressionOk = runOperationContractRegressionConformance();
    console.log('\nRunning bundle/provisioning conformance (src/bundle.mjs, §16/§17) ...');
    const bundleOk = runBundleConformance();
    console.log('\nRunning CLI smoke conformance (scripts/ssss.mjs) ...');
    const cliSmokeOk = runCliSmokeConformance();
    process.exit(engineOk && runtimeOk && operationRegressionOk && bundleOk && cliSmokeOk ? 0 : 1);
  } else {
    console.log('\nℹ  No --endpoint/--engine given; ran structural + registry validation only.');
    console.log('   Reference engine:  ssss conformance --engine');
    console.log('   Live host:         ssss conformance --endpoint <url> --token <pat>');
  }
}

main();
