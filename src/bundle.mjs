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
import { loadRegistries, resolvePortability } from './registry.mjs';
import { parseDocument } from './frontmatter.mjs';

const PROFILE_INCLUDES = {
  backup: new Set(['structural', 'tenant_private', 'resource_bound']),
  template: new Set(['structural', 'resource_bound']),
  sale: new Set(['structural', 'resource_bound']),
};
const STEP_SYSTEMS = new Set(['workspace', 'branding', 'email', 'phone', 'domains', 'accounts', 'deployments', 'marketplace', 'tabs', 'automation']);
const STEP_MODES = new Set(['existing', 'provision', 'install', 'generate', 'configure']);
const PARAM_SOURCES = new Set(['user', 'llm', 'graph', 'system']);

/** Canonical, path-sorted serialization of files — the hash + transport pre-image (§16.1). */
function canonicalFiles(files) {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return sorted.map((f) => ({ path: f.path, content: f.content }));
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
    exporter = '@ssss/cli', requiredExtensions = [], parameters = [], provisioning = [],
    sourceWorkspaceId, exportedAt = '1970-01-01T00:00:00.000Z' } = opts;
  const includes = PROFILE_INCLUDES[profile];
  if (!includes) throw new Error(`Unknown export profile '${profile}'. Use backup | template | sale.`);

  const { types } = loadRegistries(registryDir);
  const dropped = [];
  const kept = [];
  const inventory = {};

  for (const file of walkVault(vaultRoot)) {
    const { data } = parseDocument(file.content);
    const type = data.type;
    const typeDef = types.get(type);
    const klass = resolvePortability(typeDef, data);
    if (!includes.has(klass)) { dropped.push({ path: file.path, type, portability: klass }); continue; }
    kept.push(file);
    if (type) inventory[type] = (inventory[type] || 0) + 1;
  }

  const files = canonicalFiles(kept);
  const manifest = {
    name, description, version,
    exported_at: exportedAt,
    ssss_core_version: loadRegistries(registryDir).core.spec_version,
    required_extensions: requiredExtensions,
    export_profile: profile,
    primitive_inventory: inventory,
    provisioning,
    parameters,
    file_count: files.length,
    provenance: { content_hash: contentHash(files), exporter },
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
  const { types, core } = loadRegistries(opts.registryDir);
  const m = bundle && bundle.manifest;
  if (!m) return { valid: false, errors: ['bundle has no manifest'] };

  for (const f of core.bundle.manifest_required_fields) {
    if (m[f] === undefined || m[f] === null) errors.push(`manifest missing required field '${f}'`);
  }
  if (!PROFILE_INCLUDES[m.export_profile]) errors.push(`invalid export_profile '${m.export_profile}'`);
  if (m.ssss_core_version && m.ssss_core_version !== core.spec_version) {
    errors.push(`bundle targets ssss_core_version ${m.ssss_core_version}; host is ${core.spec_version}`);
  }
  if (Array.isArray(bundle.files) && m.file_count !== bundle.files.length) {
    errors.push(`file_count ${m.file_count} ≠ actual ${bundle.files.length}`);
  }
  // Provenance: recompute the content hash and reject on mismatch (§16.3).
  if (m.provenance) {
    for (const f of core.bundle.provenance_required_fields) {
      if (m.provenance[f] === undefined) errors.push(`provenance missing '${f}'`);
    }
    const recomputed = contentHash(bundle.files || []);
    if (m.provenance.content_hash && m.provenance.content_hash !== recomputed) {
      errors.push(`content_hash mismatch: manifest ${m.provenance.content_hash} ≠ recomputed ${recomputed}`);
    }
  }
  // Portability conformance: no file may exceed what the profile permits (§5.5).
  const includes = PROFILE_INCLUDES[m.export_profile];
  if (includes) {
    for (const file of bundle.files || []) {
      const { data } = parseDocument(file.content);
      const klass = resolvePortability(types.get(data.type), data);
      if (!includes.has(klass)) {
        errors.push(`file '${file.path}' is ${klass}, excluded by profile '${m.export_profile}'`);
      }
    }
  }
  // Provisioning step + parameter vocabularies (§17.2 / §16.5).
  for (const s of m.provisioning || []) {
    if (!STEP_SYSTEMS.has(s.system)) errors.push(`provisioning step '${s.id}' has invalid system '${s.system}'`);
    if (!STEP_MODES.has(s.mode)) errors.push(`provisioning step '${s.id}' has invalid mode '${s.mode}'`);
  }
  for (const p of m.parameters || []) {
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
  const m = bundle.manifest;

  // Resolve required parameters (§16.5).
  const unresolved = [];
  for (const p of m.parameters || []) {
    if (p.required && parameters[p.key] === undefined && p.defaultValue === undefined) unresolved.push(p.key);
  }

  // Id-remap: every file is placed under the target prefix; build the slug set so
  // we can verify link integrity (§17.3) against the remapped target.
  const remap = (rel) => (pathPrefix ? `${pathPrefix.replace(/\/$/, '')}/${rel}` : rel);
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
    return { type: 'operation', idempotency_key: key, path: targetPath, workspace_id: workspaceId, content: f.content, intent: 'provision', dry_run: dryRun };
  });

  const ok = unresolved.length === 0 && danglingLinks.length === 0;
  return { ok, plan, unresolved, danglingLinks, steps: m.provisioning || [] };
}

/**
 * import(plan, target) → replay (§17.1). Runs each envelope through the engine
 * (§6.3). Idempotent: each envelope's idempotency_key makes a re-run a no-op.
 */
export function importBundle(plan, vaultRoot, engine) {
  const results = [];
  for (const env of plan) results.push(engine.processOperation(env, vaultRoot));
  const committed = results.filter((r) => r.success && !r.replay).length;
  return { ok: results.every((r) => r.success), committed, results };
}
