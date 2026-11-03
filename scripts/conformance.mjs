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
import { statusForResponse } from '../src/http.mjs';
import {
  DEFAULT_EXPORTER,
  contentHash,
  exportBundle,
  validateBundle,
  provisionBundle,
  importBundle,
  upgradeBundle,
} from '../src/bundle.mjs';
import { parseDocument } from '../src/frontmatter.mjs';
import { loadRegistries } from '../src/registry.mjs';
import { createRunEnvelope, planWorkflowTrigger, resolveSubjectOwner, subjectMatches, triggerMatchesEvent } from '../src/runtime.mjs';
import {
  buildSemanticIndex,
  enrichSemanticIndex,
  renderSemanticRecord,
  searchSemanticIndex,
  searchSemanticIndexWithAdapter,
} from '../src/semantic.mjs';
import { auditRegistryFieldUsage } from './audit-registry-field-usage.mjs';
import { validateSkills } from './validate-skills.mjs';
import { auditSpecExamples } from './audit-spec-examples.mjs';
import { runKernel09Conformance } from './conformance-09.mjs';
import { createServer } from './cmd-serve.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '..', 'conformance', 'fixtures.json');
const REFERENCE_BUNDLE = path.resolve(__dirname, '..', 'conformance', 'reference-bundle.ucw.json');
const REGISTRY_DIR = path.resolve(__dirname, '..', 'registry');
const PACKAGE = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
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
async function runAgainstEngine(doc) {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-vault-'));
  const engine = createEngine();
  let pass = 0, fail = 0;
  try {
    for (const f of doc.fixtures) {
      const want = f.expected_response || {};
      const res = await engine.processOperation(f.request, vault);
      const okSuccess = want.success == null || res.success === want.success;
      const wantType = want.validation && want.validation.type;
      const okType = wantType == null || (res.validation && res.validation.type === wantType);
      const okValid = !want.validation || want.validation.valid == null || res.validation.valid === want.validation.valid;
      // The reference transport's status must match the fixture's canonical code (§6.5).
      const gotStatus = statusForResponse(res);
      const okStatus = f.expected_http_status == null || gotStatus === f.expected_http_status;
      if (okSuccess && okType && okValid && okStatus) { pass++; console.log(`  ✅ ${f.id} — ${f.name}`); }
      else {
        fail++;
        console.log(`  ❌ ${f.id} — ${f.name}`);
        console.log(`       want success=${want.success} valid=${want.validation?.valid} type=${wantType}`);
        console.log(`       got  success=${res.success} valid=${res.validation?.valid} type=${res.validation?.type} errors=${JSON.stringify(res.validation?.errors)}`);
        if (!okStatus) console.log(`       want status=${f.expected_http_status} got status=${gotStatus} code=${res.error?.code}`);
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
async function runBundleConformance() {
  if (!fs.existsSync(REFERENCE_BUNDLE)) {
    console.log('  ⚠  No reference bundle; run `node scripts/build-reference-bundle.mjs` first.');
    return false;
  }
  const bundle = JSON.parse(fs.readFileSync(REFERENCE_BUNDLE, 'utf8'));
  const checks = [];
  const check = (name, cond, detail = '') => { checks.push({ name, cond, detail }); };

  const { valid, errors } = validateBundle(bundle, { registryDir: REGISTRY_DIR });
  check('reference bundle is schema- and hash-valid', valid, errors.join('; '));
  check('reference bundle provenance matches the published package identity',
    bundle.manifest.provenance.exporter === `${PACKAGE.name}@${PACKAGE.version}`,
    `got=${bundle.manifest.provenance.exporter}`);

  const defaultExportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-exporter-'));
  try {
    fs.mkdirSync(path.join(defaultExportRoot, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(defaultExportRoot, 'rules', 'identity.md'), [
      '---',
      'type: rule',
      'title: Exporter Identity',
      'description: Proves the default exporter uses the published package name.',
      'timestamp: 2026-07-10T00:00:00Z',
      'name: Exporter Identity',
      '---',
      '',
      'Identity fixture.',
      '',
    ].join('\n'));
    const defaultExport = exportBundle(defaultExportRoot, { registryDir: REGISTRY_DIR });
    check('default bundle exporter matches the published package name',
      defaultExport.manifest.provenance.exporter === DEFAULT_EXPORTER,
      `got=${defaultExport.manifest.provenance.exporter}`);
  } finally {
    fs.rmSync(defaultExportRoot, { recursive: true, force: true });
  }
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

  const malformedFileBundle = JSON.parse(JSON.stringify(bundle));
  malformedFileBundle.files[0] = null;
  const malformedFileValidation = validateBundle(malformedFileBundle, { registryDir: REGISTRY_DIR });
  check('bundle validation returns structured errors for malformed file entries',
    !malformedFileValidation.valid &&
    malformedFileValidation.errors.some((error) => error.includes('file entries must be objects')),
    malformedFileValidation.errors.join('; '));

  const unknownExtensionBundle = JSON.parse(JSON.stringify(bundle));
  unknownExtensionBundle.manifest.required_extensions = ['missing-extension'];
  const unknownExtensionValidation = validateBundle(unknownExtensionBundle, { registryDir: REGISTRY_DIR });
  check('bundle validation rejects unknown required_extensions entries',
    !unknownExtensionValidation.valid && unknownExtensionValidation.errors.some((e) => e.includes("required extension 'missing-extension'")),
    unknownExtensionValidation.errors.join('; '));

  const invalidPatternBundle = JSON.parse(JSON.stringify(bundle));
  const invalidPattern = invalidPatternBundle.files.find((file) => parseDocument(file.content).data.type === 'rule');
  invalidPattern.path = 'primitives/invalid.md';
  invalidPattern.content = [
    '---', 'type: primitive', 'title: Invalid Primitive', 'description: Invalid namespace pattern.',
    'timestamp: 2026-07-10T00:00:00Z', 'primitive_id: invalid!:thing', 'namespace: invalid!',
    'version: 1', 'name: Invalid', 'mutation: replace', 'portability: structural',
    'scopes: [workspace]', 'fields: [placeholder]', '---', '', 'Invalid.', '',
  ].join('\n');
  invalidPatternBundle.manifest.primitive_inventory.rule--;
  invalidPatternBundle.manifest.primitive_inventory.primitive = 1;
  invalidPatternBundle.manifest.provenance.content_hash = contentHash(invalidPatternBundle.files);
  const invalidPatternValidation = validateBundle(invalidPatternBundle, { registryDir: REGISTRY_DIR });
  check('bundle validation enforces registry patterns before import',
    !invalidPatternValidation.valid &&
    invalidPatternValidation.errors.some((error) => error.includes('registry pattern')),
    invalidPatternValidation.errors.join('; '));

  const prov = provisionBundle(bundle, { workspaceId: 'ws-conf', parameters: { business_name: 'Demo', domain: 'demo.example' } });
  check('provision resolves params + link integrity (no dangling [[links]])', prov.ok,
    `unresolved=${JSON.stringify(prov.unresolved)} dangling=${JSON.stringify(prov.danglingLinks)}`);

  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-bundle-'));
  try {
    const engine = createEngine({ registryDir: REGISTRY_DIR });
    const first = await importBundle(prov.plan, vault, engine);
    check('import commits every file', first.ok && first.committed === bundle.files.length,
      `ok=${first.ok} committed=${first.committed}/${bundle.files.length}`);

    const second = await importBundle(prov.plan, vault, engine);
    check('re-import is idempotent (0 new commits)', second.ok && second.committed === 0,
      `committed=${second.committed}`);

    const landed = fs.existsSync(path.join(vault, 'tasks')) ? fs.readdirSync(path.join(vault, 'tasks')).filter(f => f !== 'index.md') : [];
    check('no tenant_private task file on disk after import', landed.length === 0, `found=${JSON.stringify(landed)}`);
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }

  const atomicVault = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-bundle-atomic-'));
  try {
    const engine = createEngine({ registryDir: REGISTRY_DIR });
    const sourceContent = [
      '---', 'type: rule', 'title: Atomic Source', 'description: Preflight source.',
      'timestamp: 2026-07-10T00:00:00Z', 'name: Atomic Source', '---', '', 'Body.', '',
    ].join('\n');
    const badPlan = [
      {
        type: 'operation', idempotency_key: 'atomic-source', workspace_id: 'ws-atomic',
        path: 'rules/atomic.md', content: sourceContent, actor: { role: 'system' },
      },
      {
        type: 'operation', idempotency_key: 'atomic-invalid', workspace_id: 'ws-atomic',
        path: 'primitives/invalid.md', actor: { role: 'system' },
        content: [
          '---', 'type: primitive', 'title: Invalid Primitive',
          'description: Must fail before the source commits.', 'timestamp: 2026-07-10T00:00:00Z',
          'primitive_id: invalid!:thing', 'namespace: invalid!', 'version: 1', 'name: Invalid',
          'mutation: replace', 'portability: structural', 'scopes: [workspace]',
          'fields: [placeholder]', '---', '', 'Invalid.', '',
        ].join('\n'),
      },
    ];
    const atomicResult = await importBundle(badPlan, atomicVault, engine);
    check('two-phase import prevents partial commits on a late invalid envelope',
      atomicResult.ok === false && atomicResult.committed === 0 &&
      !fs.existsSync(path.join(atomicVault, 'rules', 'atomic.md')),
      JSON.stringify(atomicResult.results.map((result) => result.validation?.errors || [])));
  } finally {
    fs.rmSync(atomicVault, { recursive: true, force: true });
  }

  const referenceVault = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-bundle-refs-'));
  const missingVault = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-bundle-missing-'));
  try {
    const engine = createEngine({ registryDir: REGISTRY_DIR });
    const envelope = (id, target, fields) => ({
      type: 'operation', workspace_id: 'ws-refs', idempotency_key: id,
      path: target, actor: { role: 'system' },
      content: ['---', 'title: Reference test', 'description: Complete planned references.',
        'timestamp: 2026-10-28T00:00:00Z', ...fields, '---', '', 'Exact payload.', ''].join('\n'),
    });
    const asset = envelope('ref-asset', 'assets/source.md', [
      'type: asset', 'name: source', 'mime_type: text/plain', 'encoding: utf-8',
      'resource_ref: resources/store.md',
    ]);
    const resource = envelope('ref-resource', 'resources/store.md', [
      'type: resource', 'name: store', 'kind: storage', 'status: bound',
    ]);
    const imported = await importBundle([asset, resource], referenceVault, engine);
    check('fresh import resolves a forward reference from the complete plan',
      imported.ok && imported.committed === 2,
      JSON.stringify(imported.results.map(item => item.validation?.errors || [])));
    const missing = await importBundle([asset], missingVault, engine);
    check('missing planned reference rejects import without partial writes',
      !missing.ok && missing.committed === 0 && !fs.existsSync(path.join(missingVault, 'assets/source.md')));
  } finally {
    fs.rmSync(referenceVault, { recursive: true, force: true });
    fs.rmSync(missingVault, { recursive: true, force: true });
  }

  // Phase 3 Deliverables: S2, S3, S4, S11, D4 bindings, legacy bundle
  const multiVault = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-bundle-multi-'));
  try {
    const engine = createEngine({ registryDir: REGISTRY_DIR });
    // S2: Two-workspace install into different workspaces with prefixes
    const provAlpha = provisionBundle(bundle, {
      workspaceId: 'ws-alpha',
      pathPrefix: 'apps/alpha',
      parameters: { business_name: 'Alpha Fest', domain: 'alpha.example' },
    });
    const provBeta = provisionBundle(bundle, {
      workspaceId: 'ws-beta',
      pathPrefix: 'apps/beta',
      parameters: { business_name: 'Beta Fest', domain: 'beta.example' },
    });
    check('two-workspace provisioning succeeds for both instances', provAlpha.ok && provBeta.ok,
      `alpha=${provAlpha.ok} beta=${provBeta.ok}`);

    // Check slug remapping and prefixing
    const alphaSlugs = provAlpha.plan.map((e) => parseDocument(e.content).data.slug).filter(Boolean);
    const betaSlugs = provBeta.plan.map((e) => parseDocument(e.content).data.slug).filter(Boolean);
    const distinctSlugs = alphaSlugs.every((s) => !betaSlugs.includes(s) && s.startsWith('apps-alpha-'));
    check('two-workspace install isolates slugs and prefixes paths without alias collision (S2)',
      distinctSlugs && provAlpha.plan.every((e) => e.path.startsWith('apps/alpha/')) &&
      provBeta.plan.every((e) => e.path.startsWith('apps/beta/')));

    // Check link integrity in both targets (no dangling links)
    check('two-workspace install rewrites internal links and resolves all targets (S2)',
      provAlpha.danglingLinks.length === 0 && provBeta.danglingLinks.length === 0);

    // Import both into the same vault
    const importAlpha = await importBundle(provAlpha.plan, multiVault, engine);
    const importBeta = await importBundle(provBeta.plan, multiVault, engine);
    check('two-workspace import commits both instances into the same vault without conflict (S2)',
      importAlpha.ok && importBeta.ok &&
      importAlpha.committed === bundle.files.length && importBeta.committed === bundle.files.length);

    // S3: Determinism
    const provBeta2 = provisionBundle(bundle, {
      workspaceId: 'ws-beta',
      pathPrefix: 'apps/beta',
      parameters: { business_name: 'Beta Fest', domain: 'beta.example' },
    });
    check('provisioning is deterministic: equal inputs yield byte-identical plan (S3)',
      JSON.stringify(provBeta.plan) === JSON.stringify(provBeta2.plan));

    const reimportBeta = await importBundle(provBeta2.plan, multiVault, engine);
    check('re-importing provisioned plan commits 0 new documents (S3)',
      reimportBeta.ok && reimportBeta.committed === 0);

    // D4: Resource bindings emitted in result
    check('provisionBundle emits resource bindings with relations and modes (D4)',
      provAlpha.bindings.length > 0 &&
      provAlpha.bindings.some((b) => b.type === 'domain' && b.value === 'alpha.example' && b.relation === 'owns_domain'));

    // D4: Unbound required resource fails when not dryRun
    const unboundBundle = JSON.parse(JSON.stringify(bundle));
    const provUnbound = provisionBundle(unboundBundle, {
      workspaceId: 'ws-unbound',
      parameters: { business_name: 'Unbound Fest' }, // domain omitted!
      dryRun: false,
    });
    check('unbound required resource fails provisioning when dryRun is false (D4)',
      !provUnbound.ok && provUnbound.errors.some((e) => e.includes('unbound required resource')));

    const provUnboundDry = provisionBundle(unboundBundle, {
      workspaceId: 'ws-unbound',
      parameters: { business_name: 'Unbound Fest' },
      dryRun: true,
    });
    check('unbound required resource error is suppressed when dryRun is true (D4)',
      !provUnboundDry.errors.some((e) => e.includes('unbound required resource')));

    // S4: Dependencies
    const depFiles = [
      { path: 'rules/dep.md', content: '---\ntype: rule\ntitle: Dep\ndescription: Dep.\ntimestamp: 2026-07-02T00:00:00Z\nname: Dep\n---\nDep body.\n' },
    ];
    const depBundle = {
      manifest: {
        name: 'core-dep',
        description: 'Core dependency bundle',
        version: '1.0.0',
        exported_at: '2026-07-02T00:00:00Z',
        ssss_core_version: '0.9',
        required_extensions: [],
        export_profile: 'template',
        primitive_inventory: { rule: 1 },
        provisioning: [],
        parameters: [],
        file_count: 1,
        provenance: {
          content_hash: contentHash(depFiles),
          exporter: DEFAULT_EXPORTER,
        },
      },
      files: depFiles,
    };

    const bundleWithDep = JSON.parse(JSON.stringify(bundle));
    bundleWithDep.manifest.dependencies = {
      primitives: bundle.manifest.dependencies?.primitives || [],
      extensions: bundle.manifest.dependencies?.extensions || [],
      migrations: [],
      integrity: bundle.manifest.dependencies?.integrity,
      bundles: [
        { id: 'core-dep', installMode: 'required' },
        { id: 'opt-pack', installMode: 'optional', description: 'Optional telemetry pack' },
      ],
    };

    // Missing required dependency fails
    const provMissingDep = provisionBundle(bundleWithDep, {
      workspaceId: 'ws-dep-test',
      parameters: { business_name: 'Test', domain: 'test.example' },
    });
    check('bundle with missing required dependency fails clearly (S4)',
      !provMissingDep.ok && provMissingDep.errors.some((e) => e.includes("missing required bundle dependency 'core-dep'")));

    // Supplied dependency installs first and suggested dependencies are returned
    const provWithDep = provisionBundle(bundleWithDep, {
      workspaceId: 'ws-dep-test',
      parameters: { business_name: 'Test', domain: 'test.example' },
      dependencies: { 'core-dep': depBundle },
    });
    check('bundle with supplied dependency provisions dependency first (S4)',
      provWithDep.ok &&
      provWithDep.dependencies.installed.includes('core-dep') &&
      provWithDep.plan[0].path === 'rules/dep.md' &&
      provWithDep.dependencies.suggested.some((s) => s.id === 'opt-pack' && s.installMode === 'optional'));

    // Dependency cycle detection
    const cyclicBundleA = JSON.parse(JSON.stringify(depBundle));
    cyclicBundleA.manifest.name = 'cycle-a';
    cyclicBundleA.manifest.dependencies = {
      primitives: ['rule'], extensions: [], migrations: [],
      integrity: { content_hash: cyclicBundleA.manifest.provenance.content_hash, ssss_core_version: '0.9' },
      bundles: [{ id: 'cycle-b', installMode: 'required' }],
    };
    const cyclicBundleB = JSON.parse(JSON.stringify(depBundle));
    cyclicBundleB.manifest.name = 'cycle-b';
    cyclicBundleB.manifest.dependencies = {
      primitives: ['rule'], extensions: [], migrations: [],
      integrity: { content_hash: cyclicBundleB.manifest.provenance.content_hash, ssss_core_version: '0.9' },
      bundles: [{ id: 'cycle-a', installMode: 'required' }],
    };
    const provCycle = provisionBundle(cyclicBundleA, {
      dependencies: { 'cycle-b': cyclicBundleB },
    });
    check('dependency cycle is rejected with clear cycle error (D5)',
      !provCycle.ok && provCycle.errors.some((e) => e.includes('dependency cycle detected')));

    // S11 / D8: Base-version conflict protection
    const durVault = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-bundle-dur-'));
    try {
      const v1Envelope = {
        type: 'operation', workspace_id: 'ws-dur', idempotency_key: 'v1-init',
        path: 'rules/managed.md', actor: { role: 'system' },
        content: '---\ntype: rule\ntitle: Base Rule\ndescription: Base version.\ntimestamp: 2026-07-02T00:00:00Z\nname: Base Rule\n---\nBase content.\n',
      };
      const v1Res = await engine.processOperation(v1Envelope, durVault);
      check('v1 initial document commits cleanly', v1Res.success);
      const v1Hash = 'sha256:' + crypto.createHash('sha256').update(Buffer.from(v1Envelope.content, 'utf8')).digest('hex');

      // Local edit: someone modifies the document locally
      const v2LocalEnvelope = {
        type: 'operation', workspace_id: 'ws-dur', idempotency_key: 'v2-local',
        path: 'rules/managed.md', actor: { role: 'admin' },
        content: '---\ntype: rule\ntitle: Base Rule\ndescription: Modified locally.\ntimestamp: 2026-07-03T00:00:00Z\nname: Base Rule\n---\nModified locally.\n',
      };
      const v2Res = await engine.processOperation(v2LocalEnvelope, durVault);
      check('local edit v2 commits cleanly', v2Res.success);

      // Attempt to deliver an older/divergent content with expected_before_hash === v1Hash
      const staleDeliveryEnvelope = {
        type: 'operation', workspace_id: 'ws-dur', idempotency_key: 'stale-delivery',
        path: 'rules/managed.md', actor: { role: 'system' },
        expected_before_hash: v1Hash,
        content: '---\ntype: rule\ntitle: Base Rule\ndescription: Stale update.\ntimestamp: 2026-07-04T00:00:00Z\nname: Base Rule\n---\nStale delivery.\n',
      };
      const staleRes = await engine.processOperation(staleDeliveryEnvelope, durVault);
      check('stale delivery with outdated expected_before_hash fails with version_conflict (S11/D8)',
        staleRes.success === false && staleRes.error?.code === 'version_conflict');

      // Verify that local edit survived
      const diskContent = fs.readFileSync(path.join(durVault, 'rules/managed.md'), 'utf8');
      check('local edit survives intact after rejected stale delivery (S11/D8)',
        diskContent.includes('Modified locally.'));
    } finally {
      fs.rmSync(durVault, { recursive: true, force: true });
    }

    // Phase 4 Deliverables: S5 upgradeBundle, migration record, tenant_private refusal
    const upgradeVault = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-bundle-upg-'));
    try {
      // Baseline bundle v1.0.0
      const v1Files = [
        {
          path: 'rules/terms.md',
          content: '---\ntype: rule\ntitle: Terms v1\ndescription: Baseline terms.\ntimestamp: 2026-07-02T00:00:00Z\nname: Terms v1\n---\nTerms v1 content.\n',
        },
        {
          path: 'workflows/support.md',
          content: '---\ntype: workflow\ntitle: Support Flow\ndescription: Support.\ntimestamp: 2026-07-02T00:00:00Z\nname: Support Flow\n---\nSupport body.\n',
        },
      ];
      const v1Bundle = {
        manifest: {
          name: 'test-app',
          description: 'Test application bundle',
          version: '1.0.0',
          exported_at: '2026-07-02T00:00:00Z',
          ssss_core_version: '0.9',
          required_extensions: [],
          export_profile: 'template',
          primitive_inventory: { rule: 1, workflow: 1 },
          provisioning: [],
          parameters: [],
          file_count: 2,
          provenance: { content_hash: contentHash(v1Files), exporter: DEFAULT_EXPORTER },
        },
        files: v1Files,
      };

      // Provision and import baseline v1
      const provV1 = provisionBundle(v1Bundle, { workspaceId: 'ws-upg-test' });
      const importV1 = await importBundle(provV1.plan, upgradeVault, engine);
      check('upgrade fixture baseline v1 imports cleanly', importV1.ok && importV1.committed === 2);

      // Operator creates a tenant_private task document in the vault
      const tenantTaskEnvelope = {
        type: 'operation',
        workspace_id: 'ws-upg-test',
        idempotency_key: 'tenant-ticket-1',
        path: 'tasks/ticket-101.md',
        actor: { role: 'admin' },
        content: '---\ntype: task\ntitle: Customer Ticket 101\ndescription: Urgent assistance.\ntimestamp: 2026-07-03T00:00:00Z\nname: Ticket 101\nstatus: pending\npriority: urgent\ncategory: support\n---\nTenant private customer message.\n',
      };
      const taskRes = await engine.processOperation(tenantTaskEnvelope, upgradeVault);
      check('tenant_private task commits into upgrade vault', taskRes.success);

      // Build next bundle v1.1.0 with structural updates
      const v2Files = [
        {
          path: 'rules/terms.md',
          content: '---\ntype: rule\ntitle: Terms v2\ndescription: Updated terms for v2.\ntimestamp: 2026-07-04T00:00:00Z\nname: Terms v2\n---\nUpdated Terms v2 content.\n',
        },
        {
          path: 'workflows/support.md',
          content: '---\ntype: workflow\ntitle: Support Flow\ndescription: Support.\ntimestamp: 2026-07-02T00:00:00Z\nname: Support Flow\n---\nSupport body.\n', // unchanged
        },
        {
          path: 'rules/refunds.md',
          content: '---\ntype: rule\ntitle: Refund Policy\ndescription: New refund rules.\ntimestamp: 2026-07-04T00:00:00Z\nname: Refund Policy\n---\nNew refund policy.\n', // newly added structural file
        },
      ];
      const v2Bundle = {
        manifest: {
          name: 'test-app',
          description: 'Test application bundle',
          version: '1.1.0',
          exported_at: '2026-07-04T00:00:00Z',
          ssss_core_version: '0.9',
          required_extensions: [],
          export_profile: 'template',
          primitive_inventory: { rule: 2, workflow: 1 },
          provisioning: [],
          parameters: [],
          file_count: 3,
          provenance: { content_hash: contentHash(v2Files), exporter: DEFAULT_EXPORTER },
        },
        files: v2Files,
      };

      // Plan upgrade
      const upgPlan = upgradeBundle(v1Bundle, v2Bundle, {
        workspaceId: 'ws-upg-test',
        registryDir: REGISTRY_DIR,
      });
      check('upgradeBundle generates plan with patch and migration (D6)',
        upgPlan.ok && upgPlan.patchesCount === 1 && upgPlan.operationsCount === 2);

      // Apply upgrade to vault
      const upgImport = await importBundle(upgPlan.plan, upgradeVault, engine);
      check('upgrade import applies structural changes and records migration (S5)',
        upgImport.ok && upgImport.committed === 3);

      // Verify structural document is updated
      const updatedTerms = fs.readFileSync(path.join(upgradeVault, 'rules/terms.md'), 'utf8');
      check('structural document was updated by upgrade patch (S5)',
        updatedTerms.includes('Terms v2') && updatedTerms.includes('Updated Terms v2 content.'));

      // Verify newly added structural file was created
      check('new structural document was created during upgrade (S5)',
        fs.existsSync(path.join(upgradeVault, 'rules/refunds.md')));

      // Verify migration primitive record exists on disk
      check('migration primitive record was committed during upgrade (D6)',
        fs.existsSync(path.join(upgradeVault, upgPlan.migration.path)));

      // Verify tenant_private document remains completely untouched
      const tenantTaskDisk = fs.readFileSync(path.join(upgradeVault, 'tasks/ticket-101.md'), 'utf8');
      check('tenant_private task document is completely untouched after upgrade (S5)',
        tenantTaskDisk.includes('Tenant private customer message.'));

      // Violating patch rejected: attempt to patch tenant_private file with intent: 'upgrade'
      const badUpgradeEnvelope = {
        type: 'patch',
        workspace_id: 'ws-upg-test',
        idempotency_key: 'bad-upg-patch',
        path: 'tasks/ticket-101.md',
        intent: 'upgrade',
        actor: { role: 'system' },
        patches: { title: 'Overwritten Ticket' },
      };
      const badRes = await engine.processOperation(badUpgradeEnvelope, upgradeVault);
      check('engine refuses upgrade envelope targeting tenant_private document (S5/D6)',
        badRes.success === false && badRes.error?.code === 'forbidden');

      // Verify tenant task is still untouched after rejected attempt
      const tenantTaskAfterBad = fs.readFileSync(path.join(upgradeVault, 'tasks/ticket-101.md'), 'utf8');
      check('tenant_private document remains intact after engine rejected violating upgrade patch (S5/D6)',
        tenantTaskAfterBad.includes('Customer Ticket 101') && !tenantTaskAfterBad.includes('Overwritten Ticket'));
    } finally {
      fs.rmSync(upgradeVault, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(multiVault, { recursive: true, force: true });
  }

  let pass = 0;
  for (const c of checks) {
    if (c.cond) { pass++; console.log(`  ✅ ${c.name}`); }
    else console.log(`  ❌ ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  }
  console.log(`\n  ${pass}/${checks.length} bundle/provisioning checks passed (§16/§17)`);
  return pass === checks.length;
}

async function runOperationContractRegressionConformance() {
  const checks = [];
  const check = (name, cond, detail = '') => { checks.push({ name, cond, detail }); };

  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-op-reg-'));
  const leaseStore = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-lease-'));
  try {
    const engine = createEngine({ registryDir: REGISTRY_DIR, leaseStore });
    const workflowPath = 'workflows/nested.md';
    const createRes = await engine.processOperation({
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

    const patchRes = await engine.processOperation({
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

    const codeRes = await engine.processOperation({
      type: 'patch',
      idempotency_key: 'leading-zero-patch',
      workspace_id: 'ws-reg',
      path: workflowPath,
      actor: { role: 'system' },
      patches: { zip: '07003', license: '00123', flag: 'true' },
    }, vault);
    await engine.processOperation({
      type: 'patch',
      idempotency_key: 'leading-zero-repatch',
      workspace_id: 'ws-reg',
      path: workflowPath,
      actor: { role: 'system' },
      patches: { description: 'A later, unrelated patch.' },
    }, vault);
    const codeText = fs.readFileSync(path.join(vault, workflowPath), 'utf8');
    const codeData = parseDocument(codeText).data;
    check('number-like strings (zip 07003, license 00123, "true") survive repeated patches',
      codeRes.success === true && codeData.zip === '07003' && codeData.license === '00123'
        && codeData.flag === 'true' && codeText.includes('zip: "07003"'),
      codeText);

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
    const missingLease = await engine.processOperation(leasedEnvelope, vault);
    check('lease conflict rejects missing lease_id', missingLease.success === false && missingLease.validation.errors.some((e) => e.includes('leased')));

    const mismatchLease = await engine.processOperation({ ...leasedEnvelope, idempotency_key: 'lease-mismatch', lease_id: 'wrong' }, vault);
    check('lease conflict rejects mismatched lease_id', mismatchLease.success === false && mismatchLease.validation.errors.some((e) => e.includes('Lease mismatch')));

    const matchedLease = await engine.processOperation({ ...leasedEnvelope, idempotency_key: 'lease-match', lease_id: 'lease-ok' }, vault);
    check('lease allows matching lease_id', matchedLease.success === true, JSON.stringify(matchedLease.validation?.errors || []));

    const expiredTarget = 'rules/expired.md';
    const expiredPathKey = crypto.createHash('sha256').update(expiredTarget).digest('hex');
    fs.writeFileSync(path.join(leaseDir, `${expiredPathKey}.lease.json`), JSON.stringify({
      lease_id: 'expired',
      expires_at: '2000-01-01T00:00:00.000Z',
    }));
    const expiredLease = await engine.processOperation({ ...leasedEnvelope, idempotency_key: 'lease-expired', path: expiredTarget }, vault);
    check('expired lease does not block writes', expiredLease.success === true, JSON.stringify(expiredLease.validation?.errors || []));

    const unreadableTarget = 'rules/unreadable.md';
    const unreadablePathKey = crypto.createHash('sha256').update(unreadableTarget).digest('hex');
    fs.writeFileSync(path.join(leaseDir, `${unreadablePathKey}.lease.json`), '{not json');
    const unreadableLease = await engine.processOperation({ ...leasedEnvelope, idempotency_key: 'lease-unreadable', path: unreadableTarget }, vault);
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

async function runAssetPointerConformance() {
  const checks = [];
  const check = (name, cond, detail = '') => { checks.push({ name, cond, detail }); };

  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-asset-'));
  const doc = (fields, body = '') => ['---', ...fields, '---', '', body, ''].join('\n');
  const assetHead = [
    'type: asset',
    'name: training-video',
    'title: Training Video',
    'description: Onboarding video stored outside the vault.',
    'timestamp: 2026-09-28T00:00:00Z',
    'mime_type: video/mp4',
  ];
  let n = 0;
  const write = (filePath, content) => engine.processOperation({
    type: 'operation',
    idempotency_key: `asset-${++n}`,
    workspace_id: 'ws-asset',
    path: filePath,
    actor: { role: 'system' },
    content,
  }, vault);
  const errorsOf = (res) => (res.validation?.errors || []).join('; ');
  const engine = createEngine({ registryDir: REGISTRY_DIR });
  try {
    const bucket = await write('resources/media-bucket.md', doc([
      'type: resource',
      'name: Media Bucket',
      'title: Media Bucket',
      'description: Object storage for large media.',
      'timestamp: 2026-09-28T00:00:00Z',
      'kind: s3_bucket',
      'status: bound',
      'binds: s3://seller-media',
    ]));
    check('resource fixture commits', bucket.success === true, errorsOf(bucket));

    const inline = await write('assets/logo.md', doc([
      'type: asset', 'name: logo', 'title: Logo', 'description: Inline icon.',
      'timestamp: 2026-09-28T00:00:00Z', 'mime_type: image/svg+xml', 'encoding: utf-8',
    ], '<svg xmlns="http://www.w3.org/2000/svg"/>'));
    check('inline asset needs no pointer fields', inline.success === true, errorsOf(inline));

    const noUri = await write('assets/no-uri.md', doc([...assetHead, 'encoding: none', 'x_portability: resource_bound']));
    check('pointer asset without storage_uri is rejected',
      noUri.success === false && errorsOf(noUri).includes('storage_uri'), errorsOf(noUri));

    const noClass = await write('assets/no-class.md', doc([...assetHead, 'encoding: none', 'storage_uri: s3://seller-media/v.mp4']));
    check('pointer asset without x_portability is rejected',
      noClass.success === false && errorsOf(noClass).includes('x_portability'), errorsOf(noClass));

    const structural = await write('assets/structural.md', doc([...assetHead, 'encoding: none',
      'storage_uri: s3://seller-media/v.mp4', 'x_portability: structural']));
    check('pointer asset cannot be marked structural',
      structural.success === false && errorsOf(structural).includes('x_portability'), errorsOf(structural));

    const wrongRef = await write('assets/wrong-ref.md', doc([...assetHead, 'encoding: none',
      'storage_uri: s3://seller-media/v.mp4', 'x_portability: resource_bound', 'resource_ref: assets/logo.md']));
    check('resource_ref must name a resource document',
      wrongRef.success === false && errorsOf(wrongRef).includes('resource_ref'), errorsOf(wrongRef));

    const hash = `sha256:${'a'.repeat(64)}`;
    const pointer = await write('assets/training-video.md', doc([...assetHead, 'encoding: none',
      'storage_uri: s3://seller-media/training/v.mp4', 'resource_ref: resources/media-bucket.md',
      `hash: "${hash}"`, 'size_bytes: 734003200', 'x_portability: resource_bound']));
    check('pointer asset with storage_uri, resource_ref, hash and size_bytes commits',
      pointer.success === true, errorsOf(pointer));

    const sale = exportBundle(vault, { registryDir: REGISTRY_DIR, profile: 'sale' });
    const exported = sale.files.find((f) => f.path === 'assets/training-video.md');
    const exportedData = exported ? parseDocument(exported.content).data : {};
    check('sale export replaces storage_uri with REQUIREMENT and keeps the content pin',
      exportedData.storage_uri === 'REQUIREMENT' && exportedData.hash === hash &&
      exportedData.size_bytes === 734003200 && !exported.content.includes('seller-media/training'),
      exported?.content || 'pointer asset missing from sale bundle');
    check('sale bundle with a pointer asset validates',
      validateBundle(sale, { registryDir: REGISTRY_DIR }).valid === true,
      validateBundle(sale, { registryDir: REGISTRY_DIR }).errors.join('; '));
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }

  let pass = 0;
  for (const c of checks) {
    if (c.cond) { pass++; console.log(`  ✅ ${c.name}`); }
    else console.log(`  ❌ ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  }
  console.log(`\n  ${pass}/${checks.length} asset pointer checks passed (§5.4 asset, §5.5)`);
  return pass === checks.length;
}

async function runSemanticLocalizationConformance() {
  const checks = [];
  const check = (name, cond, detail = '') => { checks.push({ name, cond, detail }); };
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-semantic-'));
  try {
    const engine = createEngine({ registryDir: REGISTRY_DIR });
    const sourcePath = 'rules/refund-policy.md';
    const sourceContent = [
      '---', 'type: rule', 'title: Política de reembolsos',
      'description: Explica cuándo están disponibles los reembolsos de boletos.',
      'timestamp: 2026-07-10T00:00:00Z', 'name: Refund Policy', 'language: es',
      'aliases: [términos de reembolso, política de cancelación]', 'tags: [boletos, finanzas]',
      'relations:', '  - relation: applies_to', '    target: workflows/box-office.md',
      '---', '', 'Los reembolsos están disponibles hasta catorce días antes del evento.', '',
    ].join('\n');
    const sourceWrite = await engine.processOperation({
      type: 'operation', idempotency_key: 'sem-source', workspace_id: 'ws-sem',
      path: sourcePath, content: sourceContent, actor: { role: 'system' },
    }, vault);
    check('non-English structural source commits', sourceWrite.success === true, JSON.stringify(sourceWrite.validation?.errors || []));

    const privateContent = [
      '---', 'type: task', 'title: Solicitud privada', 'description: Datos privados del cliente.',
      'timestamp: 2026-07-10T00:00:00Z', 'priority: high', 'category: support', 'status: pending',
      '---', '', 'Cuenta y detalles de pago.', '',
    ].join('\n');
    const privateWrite = await engine.processOperation({
      type: 'operation', idempotency_key: 'sem-private', workspace_id: 'ws-sem',
      path: 'tasks/private-refund.md', content: privateContent, actor: { role: 'system' },
    }, vault);
    check('tenant-private semantic source commits', privateWrite.success === true, JSON.stringify(privateWrite.validation?.errors || []));

    const first = buildSemanticIndex(vault, { registryDir: REGISTRY_DIR });
    const second = buildSemanticIndex(vault, { registryDir: REGISTRY_DIR });
    check('semantic index is deterministic', first.index_hash === second.index_hash);
    check('safe semantic default excludes tenant-private documents',
      first.documents.every((document) => document.portability === 'structural') &&
      !first.documents.some((document) => document.path.startsWith('tasks/')));
    check('semantic graph captures explicit relations', first.edges.some((edge) => edge.source === sourcePath && edge.relation === 'applies_to'));
    const lexical = searchSemanticIndex(first, 'reembolsos boletos', { limit: 3 });
    check('lexical evidence ranks same-language content', lexical[0]?.document.path === sourcePath && lexical[0].evidence.lexical > 0);

    const embed = async (texts) => texts.map((text) => /refund|reembols/i.test(text) ? [1, 0] : [0, 1]);
    const enriched = await enrichSemanticIndex(first, { embed, model: 'conformance-multilingual-v1' });
    check('embedding provenance records model and dimension', enriched.embedding.model === 'conformance-multilingual-v1' && enriched.embedding.dimension === 2);
    const crossLanguage = await searchSemanticIndexWithAdapter(enriched, 'refund policy', { embed, limit: 3 });
    check('cross-language semantic evidence ranks the authored source',
      crossLanguage[0]?.document.path === sourcePath && crossLanguage[0].evidence.semantic > 0,
      JSON.stringify(crossLanguage.map((match) => ({ path: match.document.path, evidence: match.evidence }))));

    const rendered = await renderSemanticRecord(first.documents[0], {
      language: 'ja', render: async () => ({ title: '返金ポリシー', description: 'チケット返金の条件。', body: 'イベントの14日前まで返金できます。' }),
    });
    check('runtime rendering changes presentation without changing controls',
      rendered.presentation.language === 'ja' && rendered.presentation.title === '返金ポリシー' &&
      rendered.invariant.type === first.documents[0].type && rendered.invariant.path === sourcePath);
    let forbiddenRejected = false;
    try { await renderSemanticRecord(first.documents[0], { language: 'fr', render: async () => ({ type: 'assistant', title: 'Politique' }) }); }
    catch (error) { forbiddenRejected = error.message.includes('forbidden field'); }
    check('renderer cannot change symbolic controls', forbiddenRejected);

    const privateIndex = buildSemanticIndex(vault, { includePrivate: true, registryDir: REGISTRY_DIR });
    check('private semantic indexing requires explicit opt-in', privateIndex.documents.some((document) => document.path === 'tasks/private-refund.md'));

    fs.writeFileSync(path.join(vault, 'rules', 'invalid-raw.md'), '---\ntype: rule\nname: Invalid\n---\nBody.\n');
    let invalidRawRejected = false;
    try { buildSemanticIndex(vault, { registryDir: REGISTRY_DIR }); }
    catch (error) { invalidRawRejected = error.message.includes("Missing required field 'title'"); }
    check('semantic projection rejects raw documents that violate the registry', invalidRawRejected);
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }

  let pass = 0;
  for (const c of checks) {
    if (c.cond) { pass++; console.log(`  ✅ ${c.name}`); }
    else console.log(`  ❌ ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  }
  console.log(`\n  ${pass}/${checks.length} semantic/multilingual rendering checks passed (§11.9)`);
  return pass === checks.length;
}

function runRegistryExtensionConformance() {
  const checks = [];
  const check = (name, cond, detail = '') => { checks.push({ name, cond, detail }); };
  const registry = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-registry-'));
  const extensions = path.join(registry, 'extensions');
  fs.mkdirSync(extensions, { recursive: true });
  fs.copyFileSync(path.join(REGISTRY_DIR, 'core.json'), path.join(registry, 'core.json'));
  const primitive = {
    family: 'extension', append_only: false, portability: 'structural',
    required_fields: ['type', 'name'],
  };
  const writeExtension = (name, value) =>
    fs.writeFileSync(path.join(extensions, `${name}.json`), JSON.stringify(value, null, 2));
  try {
    writeExtension('valid', {
      registry: 'valid-ext', extends: 'core', document_primitives: { custom_thing: primitive },
    });
    let validLoaded = false;
    try { validLoaded = loadRegistries(registry).types.has('custom_thing'); } catch {}
    check('valid extension registry composes with core', validLoaded);

    writeExtension('collision', {
      registry: 'collision', extends: 'core', document_primitives: { rule: primitive },
    });
    let coreCollision = false;
    try { loadRegistries(registry); } catch (error) { coreCollision = error.message.includes("primitive 'rule' collides"); }
    check('extension cannot redefine a core primitive', coreCollision);
    fs.rmSync(path.join(extensions, 'collision.json'));

    writeExtension('duplicate', {
      registry: 'duplicate', extends: 'core', document_primitives: { custom_thing: primitive },
    });
    let siblingCollision = false;
    try { loadRegistries(registry); } catch (error) { siblingCollision = error.message.includes("primitive 'custom_thing' collides"); }
    check('sibling extensions cannot redefine each other', siblingCollision);
    fs.rmSync(path.join(extensions, 'duplicate.json'));

    writeExtension('pattern', {
      registry: 'bad-pattern', extends: 'core',
      document_primitives: { patterned: { ...primitive, patterns: { name: '[' } } },
    });
    let badPattern = false;
    try { loadRegistries(registry); } catch (error) { badPattern = error.message.includes('invalid pattern'); }
    check('invalid extension regex fails during registry load', badPattern);
    fs.rmSync(path.join(extensions, 'pattern.json'));

    writeExtension('shape', {
      registry: 'bad-shape', extends: 'core',
      document_primitives: { shaped: { ...primitive, required_when: [] } },
    });
    let badShape = false;
    try { loadRegistries(registry); } catch (error) { badShape = error.message.includes('required_when must be an object'); }
    check('malformed extension constraint shapes fail during registry load', badShape);
    fs.rmSync(path.join(extensions, 'shape.json'));

    writeExtension('unknown-reference', {
      registry: 'unknown-reference', extends: 'core',
      document_primitives: {
        linked_thing: {
          ...primitive,
          references: { target_path: { allowed_types: ['missing_type'] } },
        },
      },
    });
    let unknownReference = false;
    try { loadRegistries(registry); } catch (error) { unknownReference = error.message.includes("unknown type 'missing_type'"); }
    check('extension references cannot name unknown primitive types', unknownReference);
    fs.rmSync(path.join(extensions, 'unknown-reference.json'));

    const symlinkTarget = path.join(registry, 'external.json');
    fs.writeFileSync(symlinkTarget, JSON.stringify({ registry: 'linked', extends: 'core', document_primitives: {} }));
    fs.symlinkSync(symlinkTarget, path.join(extensions, 'linked.json'));
    let symlinkRejected = false;
    try { loadRegistries(registry); } catch (error) { symlinkRejected = error.message.includes('symlinked registries'); }
    check('symlinked extension registry is rejected', symlinkRejected);
  } finally {
    fs.rmSync(registry, { recursive: true, force: true });
  }

  let pass = 0;
  for (const c of checks) {
    if (c.cond) { pass++; console.log(`  ✅ ${c.name}`); }
    else console.log(`  ❌ ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  }
  console.log(`\n  ${pass}/${checks.length} extension-registry checks passed`);
  return pass === checks.length;
}

async function runCliSmokeConformance() {
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
      const res = await engine.processOperation({
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

    const semanticOutput = JSON.parse(execFileSync('node', [
      path.join(__dirname, 'ssss.mjs'),
      'semantic',
      vault,
      '--query',
      'welcome rule',
    ], { encoding: 'utf8' }));
    check('ssss semantic returns ranked structural results',
      semanticOutput.results?.some((result) => result.document.path === 'rules/welcome.md'),
      JSON.stringify(semanticOutput.results || []));

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

    const primitiveOut = JSON.parse(execFileSync('node', [
      path.join(__dirname, 'ssss.mjs'),
      'primitive', 'create',
      '--namespace', 'acme',
      '--name', '顧客予約',
      '--language', 'ja',
      '--fields', JSON.stringify([{ id: 'status', name: '状態', kind: 'enum', values: ['pending', 'confirmed'], required: true }]),
    ], { encoding: 'utf8' }));
    check('ssss primitive create emits a stable qualified identity',
      /^acme:p_[a-f0-9]{20}$/.test(primitiveOut.primitive_id),
      JSON.stringify(primitiveOut));

    const defPath = path.join(tmp, 'definition.json');
    fs.writeFileSync(defPath, `${JSON.stringify(primitiveOut)}\n`);
    const inspectOut = JSON.parse(execFileSync('node', [
      path.join(__dirname, 'ssss.mjs'),
      'primitive', 'inspect',
      defPath,
    ], { encoding: 'utf8' }));
    const extensionPath = path.join(tmp, 'extension.json');
    fs.writeFileSync(extensionPath, `${JSON.stringify(inspectOut.registry)}\n`);
    const lockOut = JSON.parse(execFileSync('node', [
      path.join(__dirname, 'ssss.mjs'),
      'registry', 'lock',
      '--extension', extensionPath,
    ], { encoding: 'utf8' }));
    check('ssss registry lock emits integrity metadata',
      typeof lockOut.integrity === 'string' && lockOut.integrity.startsWith('sha256:'),
      JSON.stringify(lockOut));

    const composed = JSON.parse(execFileSync('node', [
      path.join(__dirname, 'ssss.mjs'),
      'registry', 'compose',
      '--extension', extensionPath,
    ], { encoding: 'utf8' }));
    check('ssss registry compose includes core and extension primitives',
      !!composed.primitives.rule && composed.aliases['ssss:rule'] === 'rule' &&
      composed.primitives[primitiveOut.primitive_id]?.registry === 'acme',
      JSON.stringify(composed));

    const fakeBin = path.join(tmp, 'bin');
    const calls = path.join(tmp, 'install-calls.txt');
    fs.mkdirSync(fakeBin);
    for (const command of ['npm', 'npx']) {
      const executable = path.join(fakeBin, command);
      fs.writeFileSync(executable, '#!/bin/sh\nprintf "%s|%s|%s\\n" "$PWD" "$0" "$*" >> "$SSSS_TEST_CALLS"\n');
      fs.chmodSync(executable, 0o755);
    }
    const trStarter = path.join(tmp, 'with-total-recall');
    execFileSync('node', [path.join(__dirname, 'ssss.mjs'), 'new', trStarter,
      '--with-total-recall', '--install', '--no-git'], {
      stdio: 'ignore',
      env: { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`, SSSS_TEST_CALLS: calls },
    });
    const installCalls = fs.readFileSync(calls, 'utf8').trim().split('\n');
    const normalizedCalls = installCalls.map((line) => {
      const [cwd, executable, args] = line.split('|');
      return `${fs.realpathSync(cwd)}|${path.basename(executable)}|${args}`;
    });
    const realStarter = fs.realpathSync(trStarter);
    check('ssss new initializes only the new project Total Recall brain',
      normalizedCalls.some((line) => line === `${realStarter}|npx|-p total-recall-brain total-recall init --project`) &&
      normalizedCalls.some((line) => line === `${realStarter}|npm|install --no-audit --no-fund`) &&
      normalizedCalls.some((line) => line === `${realStarter}|npm|test`),
      JSON.stringify(installCalls));

    const adapterOut = JSON.parse(execFileSync('node', [
      path.join(__dirname, 'ssss.mjs'),
      'adapter', 'conformance',
    ], { encoding: 'utf8' }));
    check('ssss adapter conformance report is machine-readable and green',
      adapterOut.passed === true && adapterOut.suites?.vfs_memory?.passed === true,
      JSON.stringify(adapterOut));

    const migrateOut = JSON.parse(execFileSync('node', [
      path.join(__dirname, 'ssss.mjs'),
      'migrate', '0.8-to-0.9',
      vault,
    ], { encoding: 'utf8' }));
    check('ssss migrate 0.8-to-0.9 dry-run emits backup manifest without writes',
      migrateOut.dry_run === true && migrateOut.writes_performed === 0 && Array.isArray(migrateOut.backup_manifest),
      JSON.stringify(migrateOut));

    const v1Path = path.join(tmp, 'v1.ucw.json');
    execFileSync('node', [
      path.join(__dirname, 'ssss.mjs'),
      'export', vault,
      '--out', v1Path,
      '--profile', 'template',
    ]);
    const upgDryOut = JSON.parse(execFileSync('node', [
      path.join(__dirname, 'ssss.mjs'),
      'upgrade', v1Path,
      '--vault', vault,
      '--from', v1Path,
      '--dry-run',
      '--json',
    ], { encoding: 'utf8' }));
    check('ssss upgrade --dry-run reports 0 needed patches for identical version',
      upgDryOut.ok === true && upgDryOut.patches_count === 0,
      JSON.stringify(upgDryOut));

    // ssss serve smoke
    const serveVault = path.join(tmp, 'serve-vault');
    fs.mkdirSync(serveVault, { recursive: true });
    const serveInstance = createServer({ vault: serveVault, token: 'smoke-token', registryDir: REGISTRY_DIR });
    await new Promise((resolve) => serveInstance.listen(0, '127.0.0.1', resolve));
    const servePort = serveInstance.address().port;
    try {
      const healthRes = await fetch(`http://127.0.0.1:${servePort}/health`);
      const healthData = await healthRes.json();
      check('ssss serve health endpoint returns 200 with ok and version',
        healthRes.status === 200 && healthData.ok === true && typeof healthData.version === 'string',
        JSON.stringify(healthData));

      const serveOpRes = await fetch(`http://127.0.0.1:${servePort}/v1/operations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer smoke-token' },
        body: JSON.stringify({
          type: 'operation',
          workspace_id: 'ws-smoke',
          path: 'rules/smoke.md',
          idempotency_key: 'smoke-serve-1',
          actor: { role: 'admin', agent_id: 'smoke-agent' },
          content: '---\ntype: rule\nname: "Smoke Rule"\ntitle: "Smoke Rule"\ndescription: "Smoke test."\ntimestamp: 2026-07-02T00:00:00Z\n---\nRule.\n',
        }),
      });
      const serveOpData = await serveOpRes.json();
      check('ssss serve commits valid operation envelope with 201 Created',
        serveOpRes.status === 201 && serveOpData.success === true,
        JSON.stringify(serveOpData));
    } finally {
      await new Promise((resolve) => serveInstance.close(resolve));
    }

    // ssss bridge smoke
    const bridgeVault = path.join(tmp, 'bridge-vault');
    fs.mkdirSync(bridgeVault, { recursive: true });
    const bridgeInput = JSON.stringify({
      type: 'operation',
      workspace_id: 'ws-smoke',
      path: 'rules/bridge-rule.md',
      idempotency_key: 'smoke-bridge-1',
      actor: { role: 'admin', agent_id: 'smoke-agent' },
      content: '---\ntype: rule\nname: "Bridge Rule"\ntitle: "Bridge Rule"\ndescription: "Smoke test."\ntimestamp: 2026-07-02T00:00:00Z\n---\nRule.\n',
    });
    const bridgeOut = JSON.parse(execFileSync('node', [
      path.join(__dirname, 'ssss.mjs'),
      'bridge',
      '--vault', bridgeVault,
    ], { input: bridgeInput, encoding: 'utf8' }));
    check('ssss bridge executes operation over stdin/stdout JSON',
      bridgeOut.success === true && bridgeOut.path === 'rules/bridge-rule.md',
      JSON.stringify(bridgeOut));
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
 * Cross-language wire protocol and bridge conformance (spec §6.8).
 * Proves that:
 *   1. The reference HTTP server (ssss serve) passes 100% of canonical fixtures via POST /v1/operations.
 *   2. The subprocess bridge (ssss bridge) passes 100% of canonical fixtures via stdin/stdout JSON.
 */
async function runWireAndBridgeConformance(doc) {
  const checks = [];
  const check = (name, cond, detail = '') => { checks.push({ name, cond, detail }); };

  // 1. HTTP Wire Contract Conformance (ssss serve, spec §6.8)
  const serveVault = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-wire-conformance-'));
  try {
    const server = createServer({ vault: serveVault, token: 'wire-test-token', registryDir: REGISTRY_DIR });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    try {
      const endpoint = `http://127.0.0.1:${port}/v1/operations`;
      let pass = 0;
      for (const f of doc.fixtures) {
        const headers = { 'content-type': 'application/json', authorization: 'Bearer wire-test-token' };
        const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(f.request) });
        const body = await res.json().catch(() => ({}));
        const want = f.expected_response || {};
        const okSuccess = want.success == null || body.success === want.success;
        const okStatus = f.expected_http_status == null || res.status === f.expected_http_status;
        if (okSuccess && okStatus) pass++;
      }
      check(`reference HTTP server passes canonical fixtures (${pass}/${doc.fixtures.length}, spec §6.8)`,
        pass === doc.fixtures.length,
        `${pass}/${doc.fixtures.length} passed`);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    fs.rmSync(serveVault, { recursive: true, force: true });
  }

  // 2. Subprocess Stdin-JSON Bridge Conformance (ssss bridge, spec §6.8)
  const bridgeVault = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-bridge-conformance-'));
  try {
    let pass = 0;
    for (const f of doc.fixtures) {
      const stdout = execFileSync('node', [path.join(__dirname, 'ssss.mjs'), 'bridge', '--vault', bridgeVault], {
        input: JSON.stringify(f.request),
        encoding: 'utf8',
      });
      const body = JSON.parse(stdout.trim());
      const want = f.expected_response || {};
      const okSuccess = want.success == null || body.success === want.success;
      if (okSuccess) pass++;
    }
    check(`subprocess bridge passes canonical fixtures (${pass}/${doc.fixtures.length}, spec §6.8)`,
      pass === doc.fixtures.length,
      `${pass}/${doc.fixtures.length} passed`);
  } finally {
    fs.rmSync(bridgeVault, { recursive: true, force: true });
  }

  let passCount = 0;
  for (const c of checks) {
    if (c.cond) { passCount++; console.log(`  ✅ ${c.name}`); }
    else console.log(`  ❌ ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  }
  return passCount === checks.length;
}

/**
 * Runtime conformance (spec §11.8). Proves that a conformant daemon can treat
 * workflow frontmatter as the canonical schedule source, then derive trigger,
 * task, and run envelopes without introducing a scheduler database of record.
 */
async function runRuntimeConformance() {
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
  const eventTrigger = { source: 'event', status: 'active', event_subject: 'tool/*/exec', event_match: { 'principal.kind': ['agent', 'user'] } };
  const toolEvent = { event_id: 'e1', timestamp: scheduledFor, subject: 'tool/ssh/exec', principal: { kind: 'agent', id: 'a' } };
  check('event trigger matches by subject glob and payload predicate',
    triggerMatchesEvent(eventTrigger, toolEvent) === true
    && triggerMatchesEvent(eventTrigger, { ...toolEvent, subject: 'tool/ssh/a/exec' }) === false
    && triggerMatchesEvent(eventTrigger, { ...toolEvent, principal: { kind: 'service', id: 's' } }) === false
    && triggerMatchesEvent({ ...eventTrigger, status: 'paused' }, toolEvent) === false
    && triggerMatchesEvent({ source: 'event', status: 'active' }, toolEvent) === false
    && triggerMatchesEvent({ ...eventTrigger, source: 'cron' }, toolEvent) === false);
  check('subject globs: * stays in a segment, ** crosses segments',
    subjectMatches('secrets/*', 'secrets/KEY') && !subjectMatches('secrets/*', 'secrets/a/b') && subjectMatches('secrets/**', 'secrets/a/b'));
  const planEvent = (event) => planWorkflowTrigger({ workflowPath, workflowContent, workspaceId: 'TEST_WORKSPACE_ID', trigger: { type: 'event', event_type: 'tool' }, event });
  const planA = planEvent(toolEvent);
  const planB = planEvent({ ...toolEvent, event_id: 'e2' });
  check('event-driven work is keyed by the event: same event same task, same instant different event different task',
    planEvent(toolEvent).envelopes[1].idempotency_key === planA.envelopes[1].idempotency_key
    && planA.envelopes[1].idempotency_key !== planB.envelopes[1].idempotency_key
    && planA.envelopes[1].path !== planB.envelopes[1].path
    && JSON.parse(planA.envelopes[0].content).causation_id === 'e1');
  const ownerA = { name: 'gate', owns: ['tool/**'] };
  const ownerB = { name: 'mesh-warden', owns: ['tool/ssh/*'] };
  check('subject ownership is the longest claim; equal claims are a conflict, not a pick',
    resolveSubjectOwner('tool/ssh/exec', [ownerA, ownerB]).owner === ownerB
    && resolveSubjectOwner('tool/other/x', [ownerA, ownerB]).owner === ownerA
    && resolveSubjectOwner('x/y', [ownerA, ownerB]).owner === null
    && resolveSubjectOwner('tool/ssh/exec', [ownerB, { name: 'twin', owns: ['tool/ssh/*'] }]).conflict.length === 2);
  check('runtime emits event then task envelopes',
    firstPlan.envelopes[0].type === 'event' && firstPlan.envelopes[1].type === 'operation');

  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-runtime-'));
  try {
    const engine = createEngine({ registryDir: REGISTRY_DIR });
    const eventRes = await engine.processOperation(firstPlan.envelopes[0], vault);
    const taskRes = await engine.processOperation(firstPlan.envelopes[1], vault);
    check('trigger event commits through Operation Contract', eventRes.success === true,
      JSON.stringify(eventRes.validation?.errors || []));
    check('instantiated task commits through Operation Contract', taskRes.success === true,
      JSON.stringify(taskRes.validation?.errors || []));

    const replayEvent = await engine.processOperation(secondPlan.envelopes[0], vault);
    const replayTask = await engine.processOperation(secondPlan.envelopes[1], vault);
    check('duplicate daemon tick replays trigger event idempotently', replayEvent.replay != null);
    check('duplicate daemon tick replays task write idempotently', replayTask.replay != null);

    const runEnvelope = createRunEnvelope({
      workflowId: firstPlan.workflow_id,
      workspaceId: 'TEST_WORKSPACE_ID',
      taskPath: firstPlan.envelopes[1].path,
      status: 'queued',
      startedAt: scheduledFor,
    });
    const runRes = await engine.processOperation(runEnvelope, vault);
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

  const specProblems = auditSpecExamples();
  if (specProblems.length) {
    console.error('❌ Spec/implementation parity audit failed:');
    for (const p of specProblems) console.error(`   • ${p}`);
    process.exit(1);
  }
  console.log('✅ Spec parity: every spec example validates and the spec tables match the registry and error codes.');

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
    const engineOk = await runAgainstEngine(doc);
    console.log('\nRunning workflow runtime conformance (src/runtime.mjs, §11.8) ...');
    const runtimeOk = await runRuntimeConformance();
    console.log('\nRunning operation regression conformance (src/engine.mjs, §6/§7) ...');
    const operationRegressionOk = await runOperationContractRegressionConformance();
    console.log('\nRunning asset pointer conformance (registry/core.json asset, §5.4/§5.5) ...');
    const assetPointerOk = await runAssetPointerConformance();
    console.log('\nRunning extension-registry conformance (src/registry.mjs) ...');
    const extensionRegistryOk = runRegistryExtensionConformance();
    console.log('\nRunning semantic/multilingual rendering conformance (src/semantic.mjs, §11.9) ...');
    const semanticOk = await runSemanticLocalizationConformance();
    console.log('\nRunning SSSS 0.9 kernel/adapter/UI conformance ...');
    const kernel09Ok = await runKernel09Conformance();
    console.log('\nRunning bundle/provisioning conformance (src/bundle.mjs, §16/§17) ...');
    const bundleOk = await runBundleConformance();
    console.log('\nRunning CLI smoke conformance (scripts/ssss.mjs) ...');
    const cliSmokeOk = await runCliSmokeConformance();
    console.log('\nRunning cross-language wire & bridge conformance (spec §6.8) ...');
    const wireBridgeOk = await runWireAndBridgeConformance(doc);
    process.exit(
      engineOk && runtimeOk && operationRegressionOk && assetPointerOk && extensionRegistryOk &&
      semanticOk && kernel09Ok && bundleOk && cliSmokeOk && wireBridgeOk ? 0 : 1
    );
  } else {
    console.log('\nℹ  No --endpoint/--engine given; ran structural + registry validation only.');
    console.log('   Reference engine:  ssss conformance --engine');
    console.log('   Live host:         ssss conformance --endpoint <url> --token <pat>');
  }
}

main();
