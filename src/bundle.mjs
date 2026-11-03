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
  resolvePrimitiveDefinition,
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
    sourceWorkspaceId, exportedAt = '1970-01-01T00:00:00.000Z', registryNames } = opts;
  const includes = PROFILE_INCLUDES[profile];
  if (!includes) throw new Error(`Unknown export profile '${profile}'. Use backup | template | sale.`);

  // When a caller names the extension namespaces this vault belongs to, load only
  // those. Unrelated product extensions may share a primitive name, which is a
  // legitimate load-time collision when loaded together (§5.6).
  const registrySet = loadRegistries(registryDir, registryNames ? { only: registryNames } : {});
  const { types, core } = registrySet;
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
    const definition = resolvePrimitiveDefinition(registrySet, document.data.type);
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
  const m = bundle && bundle.manifest;
  // Scope the registry load to the extensions this bundle declares. A registry
  // directory may hold unrelated product extensions that collide by name (§5.6);
  // the bundle's own `required_extensions` is the authority on what it needs.
  const declaredExtensions = Array.isArray(m?.required_extensions) ? m.required_extensions : [];
  const only = opts.registryNames || (declaredExtensions.length && !opts.loadAllExtensions ? declaredExtensions : null);
  // A bundle may name an extension this host does not have. That is a validation
  // error to report, not a crash: fall back to the default composition so the
  // remaining checks still run and the caller sees every problem at once.
  let registrySet;
  try {
    registrySet = loadRegistries(opts.registryDir, only ? { only } : {});
  } catch (err) {
    if (!only || !/is not present in/.test(err.message)) throw err;
    registrySet = loadRegistries(opts.registryDir);
  }
  const { types, core, extensions } = registrySet;
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
      if (m.dependencies.bundles !== undefined) {
        if (!Array.isArray(m.dependencies.bundles)) {
          errors.push('manifest.dependencies.bundles must be an array');
        } else {
          for (const b of m.dependencies.bundles) {
            if (!b || typeof b !== 'object') {
              errors.push('manifest.dependencies.bundles entries must be objects');
              continue;
            }
            if (!b.id && !b.name) errors.push("manifest.dependencies.bundles entry missing 'id' or 'name'");
            if (b.installMode && !['optional', 'recommended', 'required'].includes(b.installMode)) {
              errors.push(`invalid installMode '${b.installMode}' in bundle dependency`);
            }
          }
        }
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
      const def = resolvePrimitiveDefinition(registrySet, data.type);
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
    const definition = resolvePrimitiveDefinition(registrySet, document.data.type);
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
  const {
    parameters = {},
    workspaceId = 'ws-provision',
    pathPrefix = '',
    dryRun = false,
    expectedHashes = {},
    dependencies = {},
    registryDir,
  } = opts;
  const validation = validateBundle(bundle, { registryDir });
  if (!validation.valid) {
    return { ok: false, plan: [], unresolved: [], danglingLinks: [], bindings: [], dependencies: { installed: [], suggested: [] }, errors: validation.errors, steps: [] };
  }
  const m = bundle.manifest;
  const errors = [];
  const unresolved = [];

  // 1. Resolve and type-check parameters (§16.5).
  const paramMap = new Map();
  const paramDefMap = new Map();
  for (const p of m.parameters || []) {
    paramDefMap.set(p.key, p);
    const val = parameters[p.key] !== undefined ? parameters[p.key] : p.defaultValue;
    if (val === undefined) {
      if (p.required) unresolved.push(p.key);
    } else {
      if (p.type === 'string' && typeof val !== 'string') errors.push(`parameter '${p.key}' must be a string`);
      else if (p.type === 'boolean' && typeof val !== 'boolean') errors.push(`parameter '${p.key}' must be a boolean`);
      else if (p.type === 'number' && typeof val !== 'number') errors.push(`parameter '${p.key}' must be a number`);
      paramMap.set(p.key, val);
    }
  }

  // 2. Dependencies (§17.4)
  const resolvedDependencies = {
    installed: [],
    suggested: [],
  };

  const declaredBundles = Array.isArray(m.dependencies?.bundles)
    ? m.dependencies.bundles
    : (Array.isArray(m.bundle_dependencies) ? m.bundle_dependencies : []);

  const depPool = new Map();
  if (bundle) {
    if (bundle.manifest?.name) depPool.set(bundle.manifest.name, bundle);
    if (bundle.manifest?.id) depPool.set(bundle.manifest.id, bundle);
  }
  if (dependencies && typeof dependencies === 'object') {
    const entries = dependencies instanceof Map
      ? dependencies.entries()
      : Object.entries(dependencies);
    for (const [key, depBundle] of entries) {
      if (depBundle) {
        depPool.set(key, depBundle);
        if (depBundle.manifest?.name) depPool.set(depBundle.manifest.name, depBundle);
        if (depBundle.manifest?.id) depPool.set(depBundle.manifest.id, depBundle);
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const orderedDeps = [];

  function resolveDeps(b, pathStack = []) {
    const bId = b.manifest?.name || b.manifest?.id || '(bundle)';
    if (visiting.has(bId)) {
      const cycle = [...pathStack, bId].join(' -> ');
      throw new Error(`dependency cycle detected: ${cycle}`);
    }
    if (visited.has(bId)) return;
    visiting.add(bId);

    const bDeclared = Array.isArray(b.manifest?.dependencies?.bundles)
      ? b.manifest.dependencies.bundles
      : (Array.isArray(b.manifest?.bundle_dependencies) ? b.manifest.bundle_dependencies : []);

    for (const dep of bDeclared) {
      const mode = dep.installMode || dep.install_mode || 'required';
      const depKey = dep.id || dep.name;
      if (mode === 'required') {
        const depBundle = depPool.get(depKey);
        if (!depBundle) {
          errors.push(`missing required bundle dependency '${depKey}'`);
          continue;
        }
        resolveDeps(depBundle, [...pathStack, bId]);
      } else {
        if (!resolvedDependencies.suggested.some((s) => s.id === depKey)) {
          resolvedDependencies.suggested.push({
            id: depKey,
            name: dep.name || depKey,
            installMode: mode,
            description: dep.description || '',
          });
        }
      }
    }

    visiting.delete(bId);
    visited.add(bId);
    if (b !== bundle) {
      orderedDeps.push({ id: bId, bundle: b });
    }
  }

  try {
    resolveDeps(bundle);
  } catch (err) {
    errors.push(err.message);
  }

  const dependencyPlans = [];
  const dependencyBindings = [];
  const dependencySteps = [];

  for (const { id: depId, bundle: depBundle } of orderedDeps) {
    const depResult = provisionBundle(depBundle, {
      ...opts,
      dependencies: {},
    });
    if (!depResult.ok) {
      errors.push(...depResult.errors);
      unresolved.push(...depResult.unresolved);
    }
    dependencyPlans.push(...depResult.plan);
    dependencyBindings.push(...depResult.bindings);
    dependencySteps.push(...depResult.steps);
    resolvedDependencies.installed.push(depId);
  }

  // 3. Setup path remapping and slug dictionary (§17.3)
  const normalizedPrefix = pathPrefix ? pathPrefix.replace(/\/$/, '') : '';
  if (normalizedPrefix && !isSafeBundlePath(normalizedPrefix)) {
    return { ok: false, plan: [], unresolved, danglingLinks: [], bindings: [], dependencies: resolvedDependencies, errors: [`unsafe path prefix '${pathPrefix}'`], steps: m.provisioning || [] };
  }
  const remapPath = (rel) => (normalizedPrefix ? `${normalizedPrefix}/${rel}` : rel);
  const slugPrefix = normalizedPrefix ? normalizedPrefix.replace(/[/_]/g, '-') + '-' : '';

  const declaredExts = m.required_extensions;
  const registryNames = Array.isArray(declaredExts) && declaredExts.length ? declaredExts : null;
  const registrySet = loadRegistries(registryDir, registryNames ? { only: registryNames } : {});

  const idMap = new Map();
  const slugMap = new Map();
  const presentSlugs = new Set();
  const fileParsedList = [];

  for (const f of bundle.files) {
    const parsed = parseDocument(f.content);
    fileParsedList.push({ file: f, parsed });
    const targetPath = remapPath(f.path);
    if (parsed.data.slug) {
      const targetSlug = normalizedPrefix
        ? `${slugPrefix}${crypto.createHash('sha256').update(workspaceId + ':' + parsed.data.slug).digest('hex').slice(0, 12)}`
        : parsed.data.slug;
      slugMap.set(parsed.data.slug, targetSlug);
      presentSlugs.add(targetSlug);
    }
    if (parsed.data.id) {
      const targetId = normalizedPrefix
        ? `${slugPrefix}${crypto.createHash('sha256').update(workspaceId + ':' + parsed.data.id).digest('hex').slice(0, 12)}`
        : parsed.data.id;
      idMap.set(parsed.data.id, targetId);
    }
    presentSlugs.add(targetPath.replace(/\.md$/, ''));
    presentSlugs.add(targetPath.replace(/.*\//, '').replace(/\.md$/, ''));
  }

  // 4. Second pass: apply parameter bindings, rewrite IDs/references, reserialize
  const bindings = [];
  const processedFiles = [];

  for (const { file: f, parsed } of fileParsedList) {
    const data = { ...parsed.data };
    let body = parsed.body;
    const targetPath = remapPath(f.path);

    // Apply explicit x_bind frontmatter parameter bindings (G1 §16.5.1)
    if (data.x_bind && typeof data.x_bind === 'object' && !Array.isArray(data.x_bind)) {
      for (const [field, paramKey] of Object.entries(data.x_bind)) {
        const paramDef = paramDefMap.get(paramKey);
        const val = paramMap.has(paramKey)
          ? paramMap.get(paramKey)
          : (parameters[paramKey] !== undefined ? parameters[paramKey] : paramDef?.defaultValue);
        if (val === undefined) {
          if (paramDef?.required) unresolved.push(paramKey);
        } else {
          data[field] = val;
        }
      }
      delete data.x_bind;
    }

    // Apply resource_bound requirement parameter bindings (D4 §17.1)
    for (const [k, v] of Object.entries(data)) {
      if (v === 'REQUIREMENT') {
        const aliases = resourceFieldParameterAliases(data.type, k);
        const matchedKey = aliases.find((alias) => parameters[alias] !== undefined);
        const resolvedVal = matchedKey ? parameters[matchedKey] : null;
        if (resolvedVal !== null) {
          data[k] = resolvedVal;
        }
        const matchingStep = (m.provisioning || []).find((s) => s.id === `bind-${data.type}` || s.system === RESOURCE_SYSTEM_BY_KIND[data.type]);
        const def = resolvePrimitiveDefinition(registrySet, data.type);
        const relation = def?.resource?.provision_relation || def?.resource?.binds?.[0] || k;
        const mode = matchingStep?.mode || 'provision';
        const paramDef = paramDefMap.get(matchedKey || aliases[0]) || aliases.map((a) => paramDefMap.get(a)).find(Boolean);
        const isRequired = paramDef ? !!paramDef.required : false;

        bindings.push({
          path: targetPath,
          type: data.type,
          field: k,
          relation,
          parameter_key: matchedKey || aliases[0],
          value: resolvedVal,
          mode,
        });

        if (resolvedVal === null && isRequired && !dryRun) {
          errors.push(`unbound required resource '${data.type}.${k}' for '${targetPath}' (parameter '${matchedKey || aliases[0]}')`);
        }
      }
    }

    // Remap frontmatter slug / id fields
    if (normalizedPrefix) {
      if (data.slug && slugMap.has(data.slug)) data.slug = slugMap.get(data.slug);
      if (data.id && idMap.has(data.id)) data.id = idMap.get(data.id);
      if (data.workspace_id) data.workspace_id = workspaceId;

      // Remap frontmatter typed reference paths (D3 §17.3)
      const def = resolvePrimitiveDefinition(registrySet, data.type);
      const declaredRefs = def?.references ? Object.keys(def.references) : [];
      const refFields = new Set(['resource_ref', 'target_workflow', ...declaredRefs]);
      for (const refField of refFields) {
        if (typeof data[refField] === 'string' && !data[refField].startsWith('/') && !data[refField].startsWith('http')) {
          data[refField] = remapPath(data[refField]);
        }
      }

      // Remap body links (D3 §17.3)
      body = body.replaceAll(/\[\[([^\]]+)\]\]/g, (match, slug) => {
        const remapped = slugMap.get(slug.trim());
        return remapped ? `[[${remapped}]]` : match;
      });
      body = body.replaceAll(/\[([^\]]*)\]\(([^)]+\.md)\)/g, (match, text, rel) => {
        if (!rel.startsWith('/') && !rel.startsWith('http')) return `[${text}](${remapPath(rel)})`;
        return match;
      });
    }

    const rewrittenContent = serializeDocument(data, body);
    processedFiles.push({ path: targetPath, content: rewrittenContent });
  }

  // 5. Check link integrity
  const danglingLinks = [];
  for (const pf of processedFiles) {
    for (const ref of internalRefs(pf.content)) {
      if (!presentSlugs.has(ref)) danglingLinks.push({ file: pf.path, ref });
    }
  }

  // 6. Build operation plan with expected_before_hash (D8 §6.1 / §17.1)
  const plan = processedFiles.map((pf) => {
    const expectedBeforeHash = expectedHashes[pf.path];
    const contentDigest = crypto.createHash('sha256').update(pf.content).digest('hex');
    const key = 'prov-' + crypto.createHash('sha256').update(workspaceId + ':' + pf.path + ':' + contentDigest).digest('hex').slice(0, 24);
    const envelope = {
      type: 'operation',
      idempotency_key: key,
      path: pf.path,
      workspace_id: workspaceId,
      content: pf.content,
      intent: 'provision',
      dry_run: dryRun,
      actor: { role: 'system' },
    };
    if (expectedBeforeHash !== undefined) {
      envelope.expected_before_hash = expectedBeforeHash;
    }
    return envelope;
  });

  const combinedPlan = [...dependencyPlans, ...plan];
  const combinedBindings = [...dependencyBindings, ...bindings];
  const combinedSteps = [...dependencySteps, ...(m.provisioning || [])];

  const ok = unresolved.length === 0 && danglingLinks.length === 0 && errors.length === 0;
  return {
    ok,
    plan: combinedPlan,
    unresolved: [...new Set(unresolved)],
    danglingLinks,
    bindings: combinedBindings,
    dependencies: resolvedDependencies,
    steps: combinedSteps,
    errors,
  };
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
    resolveReference: (referencePath) => plannedDocuments.get(referencePath),
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
      wouldCommit: preflight.filter((result) => !result.replay && !result.unchanged).length,
      results: preflight,
    };
  }
  const results = [];
  for (const env of plan) results.push(await engine.processOperation(env, vaultRoot, operationOptions));
  const committed = results.filter((r) => r.success && !r.replay && !r.dry_run && !r.unchanged).length;
  return { ok: results.every((r) => r.success), committed, wouldCommit: 0, results };
}

/**
 * upgradeBundle(installed, next, opts) → replayable plan of structural patch envelopes (§17.4).
 *
 * Moving an installed bundle to a new version produces only `patch` envelopes,
 * and only for structural paths. Never writes `tenant_private` data.
 * Records the upgrade in a `migration` primitive document.
 */
export function upgradeBundle(installed, next, opts = {}) {
  const {
    migration = null,
    workspaceId = 'ws-upgrade',
    dryRun = false,
    registryDir,
    pathPrefix = '',
  } = opts;

  const nextValidation = validateBundle(next, { registryDir });
  if (!nextValidation.valid) {
    return { ok: false, plan: [], errors: nextValidation.errors, migration: null, patchesCount: 0 };
  }

  const mNext = next.manifest;
  const fromVersion = installed?.manifest?.version || opts.fromVersion || '1.0.0';
  const toVersion = mNext.version || opts.toVersion || '1.1.0';

  const declaredExts = mNext.required_extensions;
  const registryNames = Array.isArray(declaredExts) && declaredExts.length ? declaredExts : null;
  const registrySet = loadRegistries(registryDir, registryNames ? { only: registryNames } : {});

  const normalizedPrefix = pathPrefix ? pathPrefix.replace(/\/$/, '') : '';
  const remapPath = (rel) => (normalizedPrefix ? `${normalizedPrefix}/${rel}` : rel);

  const installedFiles = Array.isArray(installed) ? installed : (installed?.files || []);
  const installedMap = new Map(installedFiles.map((f) => [f.path, f]));

  const errors = [];
  const patchEnvelopes = [];
  const modifiedPaths = [];

  for (const nextFile of next.files) {
    const targetPath = remapPath(nextFile.path);
    const parsed = parseDocument(nextFile.content);
    const def = resolvePrimitiveDefinition(registrySet, parsed.data.type);
    const klass = resolvePortability(def, parsed.data);

    if (klass === 'tenant_private') {
      // An upgrade bundle must never carry or modify tenant_private files
      if (installedMap.has(nextFile.path) || installedMap.has(targetPath)) {
        errors.push(`Upgrade may not target tenant_private file '${targetPath}'`);
      }
      continue;
    }

    const installedFile = installedMap.get(targetPath) || installedMap.get(nextFile.path);
    if (!installedFile) {
      // New structural file in next bundle
      const key = 'upg-create-' + crypto.createHash('sha256')
        .update(`${workspaceId}:${targetPath}:${toVersion}`)
        .digest('hex')
        .slice(0, 24);
      patchEnvelopes.push({
        type: 'operation',
        idempotency_key: key,
        path: targetPath,
        workspace_id: workspaceId,
        content: nextFile.content,
        intent: 'upgrade',
        dry_run: dryRun,
        actor: { role: 'system' },
        expected_before_hash: null,
      });
      modifiedPaths.push(targetPath);
      continue;
    }

    if (installedFile.content === nextFile.content) {
      continue; // identical, unchanged
    }

    // Compute diff between installedFile and nextFile
    const installedParsed = parseDocument(installedFile.content);
    const patches = {};

    for (const [key, val] of Object.entries(parsed.data)) {
      if (JSON.stringify(installedParsed.data[key]) !== JSON.stringify(val)) {
        patches[key] = val;
      }
    }
    for (const key of Object.keys(installedParsed.data)) {
      if (!(key in parsed.data)) {
        patches[key] = null;
      }
    }
    if (installedParsed.body !== parsed.body) {
      patches.__body__ = parsed.body;
    }

    if (Object.keys(patches).length > 0) {
      const canonicalInstalled = serializeDocument(installedParsed.data, installedParsed.body);
      const contentHashBefore = opts.expectedHashes?.[targetPath] || ('sha256:' + crypto.createHash('sha256')
        .update(Buffer.from(canonicalInstalled, 'utf8'))
        .digest('hex'));
      const key = 'upg-patch-' + crypto.createHash('sha256')
        .update(`${workspaceId}:${targetPath}:${toVersion}:${contentHashBefore}`)
        .digest('hex')
        .slice(0, 24);
      patchEnvelopes.push({
        type: 'patch',
        idempotency_key: key,
        path: targetPath,
        workspace_id: workspaceId,
        patches,
        intent: 'upgrade',
        dry_run: dryRun,
        actor: { role: 'system' },
        expected_before_hash: contentHashBefore,
      });
      modifiedPaths.push(targetPath);
    }
  }

  // Create migration primitive document record
  const migrationId = migration?.migration_id || `mig-${fromVersion}-to-${toVersion}`.replace(/[^A-Za-z0-9_-]+/g, '-');
  const migrationTitle = migration?.title || `Upgrade from ${fromVersion} to ${toVersion}`;
  const migrationDesc = migration?.description || `Structural upgrade applying ${patchEnvelopes.length} patch(es).`;
  const migrationTime = migration?.timestamp || new Date().toISOString();
  const migrationPath = remapPath(`migrations/${migrationId}.md`);

  const migrationData = {
    type: 'migration',
    title: migrationTitle,
    description: migrationDesc,
    timestamp: migrationTime,
    migration_id: migrationId,
    from_version: fromVersion,
    to_version: toVersion,
    status: 'applied',
  };
  const migrationBody = `# Migration ${migrationId}\n\nUpgraded capability bundle from ${fromVersion} to ${toVersion}.\nApplied ${patchEnvelopes.length} structural patch(es):\n${modifiedPaths.map((p) => `- ${p}`).join('\n')}\n`;
  const migrationContent = serializeDocument(migrationData, migrationBody);

  const migrationKey = 'upg-mig-' + crypto.createHash('sha256')
    .update(`${workspaceId}:${migrationPath}:${migrationId}`)
    .digest('hex')
    .slice(0, 24);

  const migrationEnvelope = {
    type: 'operation',
    idempotency_key: migrationKey,
    path: migrationPath,
    workspace_id: workspaceId,
    content: migrationContent,
    intent: 'upgrade',
    dry_run: dryRun,
    actor: { role: 'system' },
  };

  const plan = [...patchEnvelopes, migrationEnvelope];
  return {
    ok: errors.length === 0,
    plan,
    fromVersion,
    toVersion,
    migration: { id: migrationId, path: migrationPath },
    patchesCount: patchEnvelopes.filter((e) => e.type === 'patch').length,
    operationsCount: patchEnvelopes.filter((e) => e.type === 'operation').length + 1,
    errors,
  };
}
