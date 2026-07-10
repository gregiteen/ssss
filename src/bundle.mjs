/**
 * The `.ucw` bundle format (§16) and the provisioning contract (§17).
 *
 * Harvested and canonicalized from ultrachat's `WorkspaceVfsPackageService`
 * (the export/package shape) and `server/types/workspace.ts` (the template
 * variable, provisioning-step, and edge-relation vocabularies). Generalized to
 * be registry-driven: portability filtering reads `registry/core.json` §5.5
 * rather than ultrachat's hard-coded capability booleans, and the primitive
 * inventory counts by registry `type` rather than a closed category enum.
 *
 * Three pure-ish verbs (§17.1):
 *   exportBundle(vault, opts)        vault + profile  → bundle           (pure)
 *   provisionBundle(bundle, opts)    bundle + params  → replayable plan
 *   importBundle(plan, vault, eng)   plan  + engine   → committed state  (idempotent)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  loadRegistries,
  resolvePortability,
  validateDataConstraints,
  validateReferenceConstraints,
} from './registry.mjs';
import { parseDocument, serializeDocument } from './frontmatter.mjs';

export const DEFAULT_EXPORTER = '@gregiteen/ssss-cli';

const PROFILE_INCLUDES = {
  backup: new Set(['structural', 'tenant_private', 'resource_bound']),
  template: new Set(['structural', 'resource_bound']),
  sale: new Set(['structural', 'resource_bound']),
};
const STEP_SYSTEMS = new Set(['workspace', 'branding', 'email', 'phone', 'domains', 'accounts', 'deployments', 'marketplace', 'tabs', 'automation']);
const STEP_MODES = new Set(['existing', 'provision', 'install', 'generate', 'configure']);
const PARAM_SOURCES = new Set(['user', 'llm', 'graph', 'system']);
const RESOURCE_SYSTEM_BY_KIND = {
  api_connection: 'automation',
  domain: 'domains',
  email: 'email',
  mailbox: 'email',
  phone: 'phone',
};

function isSafeBundlePath(p) {
  if (typeof p !== 'string' || !p || p.includes('\0')) return false;
  if (p.startsWith('/') || p.startsWith('\\') || p.includes('\\')) return false;
  const parts = p.split('/');
  return !parts.some((part) => part === '' || part === '.' || part === '..');
}

/** Canonical, path-sorted serialization of files — the hash + transport pre-image (§16.1). */
function canonicalFiles(files) {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return sorted.map((f) => ({ path: f.path, content: f.content }));
}

function requirementParameterKey(type, field) {
  return `${type}_${field}`.replace(/[^A-Za-z0-9_]+/g, '_');
}

function resourceFieldParameterAliases(type, field) {
  const aliases = [requirementParameterKey(type, field), field];
  if (type === 'domain' && field === 'domain_name') aliases.push('domain');
  if (type === 'phone_number' && field === 'phone_number') aliases.push('phone');
  return aliases;
}

function ensureRequirementDeclarations(manifest, typeDef, resourceFields) {
  const type = typeDef.type;
  const resource = typeDef.resource || {};
  const existingParams = new Set((manifest.parameters || []).map((p) => p.key));
  for (const field of resourceFields) {
    if (resourceFieldParameterAliases(type, field).some((key) => existingParams.has(key))) continue;
    const key = requirementParameterKey(type, field);
    if (!existingParams.has(key)) {
      manifest.parameters.push({
        key,
        label: `${resource.kind || type} ${field}`.replace(/_/g, ' '),
        type: 'string',
        scope: 'workspace',
        source: 'user',
        required: false,
        description: `Satisfies the ${type} resource requirement field '${field}'.`,
      });
      existingParams.add(key);
    }
  }

  const stepId = `bind-${type}`.replace(/[^A-Za-z0-9_-]+/g, '-');
  if (!(manifest.provisioning || []).some((s) => s.id === stepId)) {
    manifest.provisioning.push({
      id: stepId,
      label: `Bind ${resource.kind || type}`,
      system: RESOURCE_SYSTEM_BY_KIND[resource.kind] || 'accounts',
      mode: 'provision',
      required: true,
      notes: resource.provision_relation || 'resource_bound requirement',
    });
  }
}

function reduceResourceBoundFile(file, typeDef, profile) {
  const binds = typeDef?.resource?.binds;
  if (!Array.isArray(binds) || binds.length === 0) {
    throw new Error(`Cannot export resource_bound '${file.path}' in ${profile}: registry type '${typeDef?.type || '(unknown)'}' does not declare resource.binds.`);
  }
  const { data, body } = parseDocument(file.content);
  const reduced = { ...data, x_portability: 'resource_bound' };
  for (const field of binds) reduced[field] = 'REQUIREMENT';
  return { path: file.path, content: serializeDocument(reduced, body), resourceFields: binds };
}

/** sha256 over the canonical file serialization (§16.3). */
export function contentHash(files) {
  const pre = JSON.stringify(canonicalFiles(files));
  return 'sha256:' + crypto.createHash('sha256').update(pre).digest('hex');
}

/** Recursively list *.md files under a vault, excluding the event log. */
function walkVault(vaultRoot) {
  const out = [];
  (function rec(dir, rel) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue; // skip .events, dotfiles
      if (entry.isSymbolicLink()) throw new Error(`Refusing to export symlinked vault entry: ${rel ? `${rel}/` : ''}${entry.name}`);
      const abs = path.join(dir, entry.name);
      const r = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) rec(abs, r);
      else if (entry.name.endsWith('.md')) out.push({ path: r, content: fs.readFileSync(abs, 'utf8') });
    }
  })(vaultRoot, '');
  return out;
}

/**
 * export(vault, profile) → bundle (§17.1). Walks the vault, filters by the §5.5
 * portability rules for the profile, sorts by path, builds the inventory, and
 * computes provenance. Pure: equal vault state + profile → byte-identical bundle.
 */
export function exportBundle(vaultRoot, opts = {}) {
  const { profile = 'backup', registryDir, name = 'untitled', description = '', version = '0.1.0',
    exporter = DEFAULT_EXPORTER, requiredExtensions = [], parameters = [], provisioning = [],
    sourceWorkspaceId, exportedAt = '1970-01-01T00:00:00.000Z' } = opts;
  const includes = PROFILE_INCLUDES[profile];
  if (!includes) throw new Error(`Unknown export profile '${profile}'. Use backup | template | sale.`);

  const { types, core } = loadRegistries(registryDir);
  const dropped = [];
  const kept = [];
  const inventory = {};
  const manifestParameters = [...parameters];
  const manifestProvisioning = [...provisioning];
  const manifestDraft = { parameters: manifestParameters, provisioning: manifestProvisioning };
  const vaultFiles = walkVault(vaultRoot);
  const vaultDocuments = new Map(vaultFiles.map((file) => {
    const parsed = parseDocument(file.content);
    return [file.path, { ...file, ...parsed }];
  }));

  for (const document of vaultDocuments.values()) {
    const base = path.basename(document.path);
    if (base === 'index.md' || base === 'log.md') continue;
    const definition = types.get(document.data.type);
    if (!definition) throw new Error(`Cannot export '${document.path}': unknown type '${document.data.type || '(missing)'}'.`);
    const issues = [
      ...validateDataConstraints(definition, document.data, core.universal_frontmatter?.required || ['type']),
      ...validateReferenceConstraints(
      definition,
      document.data,
      (referencePath) => vaultDocuments.get(referencePath) || null,
      types
      ),
    ];
    if (issues.length) {
      throw new Error(
        `Cannot export '${document.path}': ` +
        issues.map((issue) => `${issue.field}: ${issue.issue}`).join('; ')
      );
    }
  }

  for (const file of vaultFiles) {
    const { data } = parseDocument(file.content);
    const type = data.type;
    const typeDef = types.get(type);
    const klass = resolvePortability(typeDef, data);
    if (!includes.has(klass)) { dropped.push({ path: file.path, type, portability: klass }); continue; }
    if ((profile === 'sale' || profile === 'template') && klass === 'resource_bound') {
      const reduced = reduceResourceBoundFile(file, typeDef, profile);
      kept.push({ path: reduced.path, content: reduced.content });
      ensureRequirementDeclarations(manifestDraft, typeDef, reduced.resourceFields);
    } else {
      kept.push(file);
    }
    if (type) inventory[type] = (inventory[type] || 0) + 1;
  }

  const files = canonicalFiles(kept);
  const hash = contentHash(files);
  const primitiveDeps = Object.keys(inventory).sort();
  const migrationDeps = files
    .map((file) => {
      try {
        const { data } = parseDocument(file.content);
        return data.type === 'migration' ? (data.migration_id || data.slug || file.path) : null;
      } catch { return null; }
    })
    .filter(Boolean)
    .sort();
  const manifest = {
    name, description, version,
    exported_at: exportedAt,
    ssss_core_version: core.spec_version,
    required_extensions: requiredExtensions,
    export_profile: profile,
    primitive_inventory: inventory,
    dependencies: {
      primitives: primitiveDeps,
      extensions: [...requiredExtensions].sort(),
      migrations: migrationDeps,
      integrity: { content_hash: hash, ssss_core_version: core.spec_version },
    },
    provisioning: manifestProvisioning,
    parameters: manifestParameters,
    file_count: files.length,
    provenance: { content_hash: hash, exporter },
  };
  // source_workspace_id is operator-identifying — only carried in a backup (§16.2).
  if (profile === 'backup' && sourceWorkspaceId) manifest.source_workspace_id = sourceWorkspaceId;
  return { manifest, files, _dropped: dropped };
}

/**
 * Validate a bundle against the registry bundle schema (§16) and the profile/
 * portability conformance rules (§5.5). Returns { valid, errors }.
 */
export function validateBundle(bundle, opts = {}) {
  const errors = [];
  const { types, core, extensions } = loadRegistries(opts.registryDir);
  const m = bundle && bundle.manifest;
  if (!m || typeof m !== 'object' || Array.isArray(m)) {
    return { valid: false, errors: ['bundle has no object manifest'] };
  }
  const files = Array.isArray(bundle.files) ? bundle.files : [];
  const requiredExtensions = Array.isArray(m.required_extensions) ? m.required_extensions : [];
  const provisioning = Array.isArray(m.provisioning) ? m.provisioning : [];
  const parameters = Array.isArray(m.parameters) ? m.parameters : [];

  for (const f of core.bundle.manifest_required_fields) {
    if (m[f] === undefined || m[f] === null) errors.push(`manifest missing required field '${f}'`);
  }
  if (!Array.isArray(bundle.files)) errors.push('bundle.files must be an array');
  if (!Array.isArray(m.required_extensions)) errors.push('manifest.required_extensions must be an array');
  if (!Array.isArray(m.provisioning)) errors.push('manifest.provisioning must be an array');
  if (!Array.isArray(m.parameters)) errors.push('manifest.parameters must be an array');
  if (!m.primitive_inventory || typeof m.primitive_inventory !== 'object' || Array.isArray(m.primitive_inventory)) {
    errors.push('manifest.primitive_inventory must be an object');
  }
  if (m.dependencies !== undefined) {
    if (!m.dependencies || typeof m.dependencies !== 'object' || Array.isArray(m.dependencies)) {
      errors.push('manifest.dependencies must be an object');
    } else {
      for (const key of ['primitives', 'extensions', 'migrations']) {
        if (!Array.isArray(m.dependencies[key])) errors.push(`manifest.dependencies.${key} must be an array`);
      }
      if (!m.dependencies.integrity || typeof m.dependencies.integrity !== 'object' || Array.isArray(m.dependencies.integrity)) {
        errors.push('manifest.dependencies.integrity must be an object');
      } else if (typeof m.dependencies.integrity.content_hash !== 'string' || !m.dependencies.integrity.content_hash.startsWith('sha256:')) {
        errors.push('manifest.dependencies.integrity.content_hash must be a sha256 digest');
      } else if (
        m.provenance?.content_hash
        && m.dependencies.integrity.content_hash !== m.provenance.content_hash
      ) {
        errors.push('manifest.dependencies.integrity.content_hash must match provenance.content_hash');
      }
    }
  }
  for (const ext of requiredExtensions) {
    if (typeof ext !== 'string' || !ext) {
      errors.push('required extension ids must be non-empty strings');
      continue;
    }
    if (!extensions.has(ext)) errors.push(`required extension '${ext}' is not loaded`);
  }
  if (!PROFILE_INCLUDES[m.export_profile]) errors.push(`invalid export_profile '${m.export_profile}'`);
  if (m.ssss_core_version && m.ssss_core_version !== core.spec_version) {
    errors.push(`bundle targets ssss_core_version ${m.ssss_core_version}; host is ${core.spec_version}`);
  }
  if (m.file_count !== files.length) {
    errors.push(`file_count ${m.file_count} ≠ actual ${files.length}`);
  }
  const seenPaths = new Set();
  const bundleDocuments = new Map();
  let fileShapeValid = true;
  for (const file of files) {
    if (!file || typeof file !== 'object' || Array.isArray(file)) {
      errors.push('bundle file entries must be objects');
      fileShapeValid = false;
      continue;
    }
    if (!isSafeBundlePath(file.path)) {
      errors.push(`file '${file.path || '(missing)'}' has an unsafe bundle path`);
      fileShapeValid = false;
      continue;
    }
    if (typeof file.content !== 'string') {
      errors.push(`file '${file.path}' content must be a string`);
      fileShapeValid = false;
      continue;
    }
    if (seenPaths.has(file.path)) errors.push(`duplicate file path '${file.path}'`);
    seenPaths.add(file.path);
    try { bundleDocuments.set(file.path, { ...file, ...parseDocument(file.content) }); }
    catch (error) {
      errors.push(`file '${file.path}' could not be parsed: ${error.message}`);
      fileShapeValid = false;
    }
  }
  // Provenance: recompute the content hash and reject on mismatch (§16.3).
  if (m.provenance) {
    if (typeof m.provenance !== 'object' || Array.isArray(m.provenance)) {
      errors.push('manifest.provenance must be an object');
    } else {
      for (const f of core.bundle.provenance_required_fields) {
        if (m.provenance[f] === undefined) errors.push(`provenance missing '${f}'`);
      }
      if (fileShapeValid) {
        const recomputed = contentHash(files);
        if (m.provenance.content_hash && m.provenance.content_hash !== recomputed) {
          errors.push(`content_hash mismatch: manifest ${m.provenance.content_hash} ≠ recomputed ${recomputed}`);
        }
      }
    }
  }
  // Portability conformance: no file may exceed what the profile permits (§5.5).
  const includes = PROFILE_INCLUDES[m.export_profile];
  if (includes) {
    for (const document of bundleDocuments.values()) {
      const base = path.basename(document.path);
      if (base === 'index.md' || base === 'log.md') continue;
      const { data } = document;
      const def = types.get(data.type);
      if (!def) {
        errors.push(`file '${document.path}' declares unknown type '${data.type || '(missing)'}'`);
        continue;
      }
      for (const issue of validateDataConstraints(
        def,
        data,
        core.universal_frontmatter?.required || ['type']
      )) {
        errors.push(`file '${document.path}' ${issue.field}: ${issue.issue}`);
      }
      const klass = resolvePortability(types.get(data.type), data);
      if (!includes.has(klass)) {
        errors.push(`file '${document.path}' is ${klass}, excluded by profile '${m.export_profile}'`);
      }
      if ((m.export_profile === 'sale' || m.export_profile === 'template') && klass === 'resource_bound') {
        const binds = def.resource?.binds || [];
        if (!binds.length) {
          errors.push(`file '${document.path}' is resource_bound but registry type '${data.type}' declares no resource.binds`);
        }
        for (const field of binds) {
          if (data[field] !== 'REQUIREMENT') {
            errors.push(`file '${document.path}' leaks resource_bound field '${field}' in ${m.export_profile} bundle`);
          }
        }
      }
    }
  }
  for (const document of bundleDocuments.values()) {
    const definition = types.get(document.data.type);
    const issues = validateReferenceConstraints(
      definition,
      document.data,
      (referencePath) => bundleDocuments.get(referencePath) || null,
      types
    );
    for (const issue of issues) {
      errors.push(`file '${document.path}' ${issue.field}: ${issue.issue}`);
    }
  }
  // Provisioning step + parameter vocabularies (§17.2 / §16.5).
  for (const s of provisioning) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) {
      errors.push('provisioning entries must be objects');
      continue;
    }
    if (!STEP_SYSTEMS.has(s.system)) errors.push(`provisioning step '${s.id}' has invalid system '${s.system}'`);
    if (!STEP_MODES.has(s.mode)) errors.push(`provisioning step '${s.id}' has invalid mode '${s.mode}'`);
  }
  for (const p of parameters) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      errors.push('parameter entries must be objects');
      continue;
    }
    for (const f of core.bundle.parameter_fields.required) {
      if (p[f] === undefined) errors.push(`parameter '${p.key || '?'}' missing '${f}'`);
    }
    if (p.source && !PARAM_SOURCES.has(p.source)) errors.push(`parameter '${p.key}' has invalid source '${p.source}'`);
  }
  return { valid: errors.length === 0, errors };
}

/** Extract internal references a file points at: `[[slug]]` links and relative `*.md` paths. */
function internalRefs(content) {
  const refs = new Set();
  for (const m of content.matchAll(/\[\[([^\]]+)\]\]/g)) refs.add(m[1].trim());
  return [...refs];
}

/**
 * provision(bundle, params, target) → replayable plan (§17.1). Resolves
 * parameters, checks link integrity under id-remap (§17.3), and emits an ordered
 * list of Operation Contract envelopes (§6). Does not touch the filesystem.
 */
export function provisionBundle(bundle, opts = {}) {
  const { parameters = {}, workspaceId = 'ws-provision', pathPrefix = '', dryRun = false } = opts;
  const validation = validateBundle(bundle, { registryDir: opts.registryDir });
  if (!validation.valid) {
    return { ok: false, plan: [], unresolved: [], danglingLinks: [], errors: validation.errors, steps: [] };
  }
  const m = bundle.manifest;

  // Resolve required parameters (§16.5).
  const unresolved = [];
  for (const p of m.parameters || []) {
    if (p.required && parameters[p.key] === undefined && p.defaultValue === undefined) unresolved.push(p.key);
  }

  // Id-remap: every file is placed under the target prefix; build the slug set so
  // we can verify link integrity (§17.3) against the remapped target.
  const normalizedPrefix = pathPrefix ? pathPrefix.replace(/\/$/, '') : '';
  if (normalizedPrefix && !isSafeBundlePath(normalizedPrefix)) {
    return { ok: false, plan: [], unresolved, danglingLinks: [], errors: [`unsafe path prefix '${pathPrefix}'`], steps: m.provisioning || [] };
  }
  const remap = (rel) => (normalizedPrefix ? `${normalizedPrefix}/${rel}` : rel);
  const presentSlugs = new Set();
  for (const f of bundle.files) {
    const { data } = parseDocument(f.content);
    if (data.slug) presentSlugs.add(data.slug);
    presentSlugs.add(f.path.replace(/\.md$/, ''));
    presentSlugs.add(f.path.replace(/.*\//, '').replace(/\.md$/, ''));
  }
  const danglingLinks = [];
  for (const f of bundle.files) {
    for (const ref of internalRefs(f.content)) {
      if (!presentSlugs.has(ref)) danglingLinks.push({ file: f.path, ref });
    }
  }

  // Build the envelope plan. Deterministic idempotency keys make import a no-op on re-run.
  const plan = bundle.files.map((f) => {
    const targetPath = remap(f.path);
    const key = 'prov-' + crypto.createHash('sha256').update(workspaceId + ':' + targetPath).digest('hex').slice(0, 24);
    return { type: 'operation', idempotency_key: key, path: targetPath, workspace_id: workspaceId, content: f.content, intent: 'provision', dry_run: dryRun, actor: { role: 'system' } };
  });

  const ok = unresolved.length === 0 && danglingLinks.length === 0;
  return { ok, plan, unresolved, danglingLinks, steps: m.provisioning || [] };
}

/**
 * import(plan, target) → replay (§17.1). Runs each envelope through the engine
 * (§6.3). Idempotent: each envelope's idempotency_key makes a re-run a no-op.
 */
export async function importBundle(plan, vaultRoot, engine) {
  const dryRunFlags = new Set(plan.map((envelope) => !!envelope.dry_run));
  if (dryRunFlags.size > 1) {
    return {
      ok: false,
      committed: 0,
      wouldCommit: 0,
      results: [{
        success: false,
        validation: { valid: false, errors: ['Import plan may not mix dry_run and commit envelopes.'] },
      }],
    };
  }
  const plannedDocuments = new Map();
  for (const envelope of plan) {
    if (envelope.type !== 'operation' || typeof envelope.content !== 'string') continue;
    plannedDocuments.set(envelope.path, {
      path: envelope.path,
      content: envelope.content,
      ...parseDocument(envelope.content),
    });
  }
  const operationOptions = {
    referenceResolver: (referencePath) => plannedDocuments.get(referencePath),
  };
  // Two-phase import: validate the complete plan with in-plan references first.
  // A single invalid document prevents every commit, eliminating partial bundle
  // installation and allowing dry-run to validate cross-file constraints.
  const preflight = await Promise.all(plan.map((envelope) => {
    const preflightKey = 'preflight-' + crypto.createHash('sha256')
      .update(`${envelope.workspace_id}:${envelope.idempotency_key}:${envelope.path}`)
      .digest('hex')
      .slice(0, 32);
    return engine.processOperation(
      { ...envelope, idempotency_key: preflightKey, dry_run: true },
      vaultRoot,
      operationOptions
    );
  }));
  if (!preflight.every((result) => result.success)) {
    return { ok: false, committed: 0, wouldCommit: 0, results: preflight };
  }
  if (dryRunFlags.has(true)) {
    return {
      ok: true,
      committed: 0,
      wouldCommit: preflight.filter((result) => !result.replay).length,
      results: preflight,
    };
  }
  const results = [];
  for (const env of plan) results.push(await engine.processOperation(env, vaultRoot, operationOptions));
  const committed = results.filter((r) => r.success && !r.replay && !r.dry_run).length;
  return { ok: results.every((r) => r.success), committed, wouldCommit: 0, results };
}
