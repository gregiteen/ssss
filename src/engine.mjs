/**
 * The canonical SSSS Operation Contract engine (spec §6).
 *
 * Harvested and canonicalized from three reference implementations:
 *  - total-recall `src/core/operation-validator.mjs` — the §6.3 pipeline shape,
 *    idempotency replay from the audit log, and the `buildRepair` mechanism (§9).
 *  - festech `SsssOperationService.ts` — the `delete` envelope and the
 *    `resolveContainedPath` path-traversal guard.
 *  - festech `SsssValidator.ts` — registry-driven content validation (no per-type code).
 *
 * Dependency-free by design: a host should not need Zod or a YAML library to be
 * SSSS-conformant. Content is validated against `registry/core.json` (+ extensions).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseDocument, serializeDocument } from './frontmatter.mjs';
import { loadRegistries, isAppendType } from './registry.mjs';

const ENVELOPE_TYPES = ['operation', 'patch', 'event', 'delete'];
const ENVELOPE_REQUIRED = {
  operation: ['type', 'idempotency_key', 'path', 'workspace_id', 'content'],
  patch: ['type', 'idempotency_key', 'path', 'workspace_id', 'patches'],
  event: ['type', 'idempotency_key', 'path', 'workspace_id', 'content'],
  delete: ['type', 'idempotency_key', 'path', 'workspace_id'],
};

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const SAFE_IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function cacheKey(wid, key) { return JSON.stringify([wid, key]); }

function isSafeIdentifier(value) {
  return typeof value === 'string' && SAFE_IDENTIFIER_RE.test(value);
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function requestHash(envelope) {
  const payload = {
    type: envelope.type,
    path: envelope.path,
    workspace_id: envelope.workspace_id,
    actor: envelope.actor || null,
    lease_id: envelope.lease_id || null,
    dry_run: !!envelope.dry_run,
  };
  if (Object.prototype.hasOwnProperty.call(envelope, 'content')) payload.content = envelope.content;
  if (Object.prototype.hasOwnProperty.call(envelope, 'patches')) payload.patches = envelope.patches;
  return 'sha256:' + crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
}

/** festech `resolveContainedPath`: resolve a VFS path, refusing escape from the vault. */
export function resolveContainedPath(vaultRoot, vfsPath) {
  const root = path.resolve(vaultRoot);
  const raw = String(vfsPath);
  if (!raw || raw === '.' || raw.includes('\0')) throw new Error(`Invalid VFS path: ${vfsPath}`);
  if (raw.startsWith('/') || raw.startsWith('\\') || raw.includes('\\')) throw new Error(`Absolute or platform-native paths are not valid VFS paths: ${vfsPath}`);
  const parts = raw.split('/');
  if (parts.some((p) => p === '' || p === '.' || p === '..')) throw new Error(`Invalid VFS path segment in: ${vfsPath}`);
  const cleaned = parts.join('/');
  const resolved = path.resolve(root, cleaned);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Path traversal refused: ${vfsPath}`);
  }
  if (resolved === root) throw new Error(`VFS path must identify a file, not the vault root: ${vfsPath}`);
  return resolved;
}

function atomicWrite(absPath, content) {
  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(absPath)}.${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, absPath);
}

function ok(type, opId, p, resolvedType, committedAt, warnings = []) {
  return {
    success: true, type, operation_id: opId, path: p,
    committed_at: committedAt, dry_run: false,
    validation: { valid: true, type: resolvedType, errors: [], warnings },
  };
}

function fail(type, opId, p, resolvedType, errors, repairEntries) {
  const resp = {
    success: false, type, operation_id: opId, path: p,
    committed_at: null, dry_run: false,
    validation: { valid: false, type: resolvedType, errors, warnings: [] },
  };
  resp.repair = {
    field_errors: repairEntries || errors.map((e) => ({
      field: e.split(':')[0]?.trim() || '(root)', issue: e,
    })),
  };
  return resp;
}

/**
 * Create an engine bound to a registry directory. The returned object holds the
 * in-process idempotency cache, so re-applying an envelope within TTL is a no-op.
 */
export function createEngine({ registryDir, leaseStore } = {}) {
  const { types, core } = loadRegistries(registryDir);
  const idempotencyCache = new Map();

  function pruneExpired() {
    const now = Date.now();
    for (const [k, v] of idempotencyCache) if (now - v.ts > IDEMPOTENCY_TTL_MS) idempotencyCache.delete(k);
  }

  function warmFromAudit(vaultRoot, eventLogDir) {
    const auditFile = path.join(eventLogDir || path.join(vaultRoot, '.events'), 'audit.jsonl');
    if (!fs.existsSync(auditFile)) return;
    const now = Date.now();
    for (const line of fs.readFileSync(auditFile, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (r.event_type !== 'audit' || !r.payload) continue;
        const ts = Date.parse(r.ts);
        if (isNaN(ts) || now - ts > IDEMPOTENCY_TTL_MS) continue;
        const ck = cacheKey(r.payload.workspace_id, r.payload.idempotency_key);
        if (!idempotencyCache.has(ck)) {
          idempotencyCache.set(ck, {
            ts,
            request_hash: r.payload.request_hash || null,
            response: ok(r.payload.envelope_type, r.correlation_id, r.subject, r.payload.resolved_type, r.ts),
          });
        }
      } catch { /* skip corrupt line */ }
    }
  }

  function isEmpty(v) {
    return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
  }

  /** Parse a registry `required_when` condition key, e.g. "schema_version==2". */
  function parseCondition(condition) {
    const m = String(condition).match(/^(\w+)==(.+)$/);
    if (!m) return null;
    const [, field, raw] = m;
    const value = /^-?\d+$/.test(raw) ? parseInt(raw, 10) : raw;
    return { field, value };
  }

  function validateContent(resolvedType, data, filePath) {
    const def = types.get(resolvedType);
    const errors = [];
    const repair = [];
    if (!def) {
      errors.push(`Unknown SSSS type '${resolvedType}' in ${filePath}.`);
      repair.push({ field: 'type', issue: `Unknown SSSS type '${resolvedType}'.` });
      return { errors, repair };
    }
    const requiredFields = [
      ...new Set([
        ...(core.universal_frontmatter?.required || ['type']),
        ...(def.required_fields || []),
      ]),
    ];
    for (const f of requiredFields) {
      if (isEmpty(data[f])) {
        errors.push(`Missing required field '${f}' for type '${resolvedType}' in ${filePath}.`);
        repair.push({ field: f, issue: `Missing required field '${f}' for type '${resolvedType}'.` });
      }
    }
    // required_when (§9): fields required only when a condition field matches a value.
    for (const [condition, fields] of Object.entries(def.required_when || {})) {
      const cond = parseCondition(condition);
      if (!cond || data[cond.field] !== cond.value) continue;
      for (const f of fields) {
        if (isEmpty(data[f])) {
          errors.push(`Missing required field '${f}' for type '${resolvedType}' when ${condition} in ${filePath}.`);
          repair.push({ field: f, issue: `Required when ${condition}.` });
        }
      }
    }
    // enums: a present field's value(s) must be drawn from the registry's declared set.
    for (const [field, allowedValues] of Object.entries(def.enums || {})) {
      if (isEmpty(data[field])) continue;
      const values = Array.isArray(data[field]) ? data[field] : [data[field]];
      for (const v of values) {
        if (!allowedValues.includes(v)) {
          errors.push(`Invalid value '${v}' for field '${field}' on type '${resolvedType}'; must be one of: ${allowedValues.join(', ')}.`);
          repair.push({ field, issue: `Must be one of: ${allowedValues.join(', ')}.` });
        }
      }
    }
    return { errors, repair };
  }

  function appendEvent(vaultRoot, eventLogDir, record) {
    const dir = eventLogDir || path.join(vaultRoot, '.events');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, `${record.workspace_id}.jsonl`), JSON.stringify(record) + '\n');
  }

  function audit(vaultRoot, eventLogDir, opId, committedAt, envelope, resolvedType, hash) {
    const dir = eventLogDir || path.join(vaultRoot, '.events');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'audit.jsonl'), JSON.stringify({
      event_id: crypto.randomUUID(), event_type: 'audit', correlation_id: opId,
      ts: committedAt, subject: envelope.path,
      payload: {
        envelope_type: envelope.type, idempotency_key: envelope.idempotency_key,
        workspace_id: envelope.workspace_id, resolved_type: resolvedType,
        request_hash: hash,
      },
    }) + '\n');
  }

  /**
   * Process one envelope through the §6.3 pipeline.
   * @param {object} envelope
   * @param {string} vaultRoot - absolute path to the vault
   * @param {object} [options] - { agentRole, eventLogDir, leaseStore }
   */
  function processOperation(envelope, vaultRoot, options = {}) {
    const opId = crypto.randomUUID();
    const eventLogDir = options.eventLogDir;
    const warnings = [];

    // Stage 1 — Envelope validation
    if (!envelope || !ENVELOPE_TYPES.includes(envelope.type)) {
      return fail(envelope?.type, opId, envelope?.path || '', null,
        [`Invalid or missing 'type'. Must be one of: ${ENVELOPE_TYPES.join(', ')}.`],
        [{ field: 'type', issue: `Must be one of: ${ENVELOPE_TYPES.join(', ')}.` }]);
    }
    const missingEnv = ENVELOPE_REQUIRED[envelope.type].filter((f) => envelope[f] === undefined || envelope[f] === null);
    if (missingEnv.length) {
      return fail(envelope.type, opId, envelope.path || '', null,
        missingEnv.map((f) => `Missing required envelope field '${f}' for ${envelope.type}.`),
        missingEnv.map((f) => ({ field: f, issue: `Required for envelope type '${envelope.type}'.` })));
    }
    if (!isSafeIdentifier(envelope.workspace_id)) {
      return fail(envelope.type, opId, envelope.path || '', null,
        [`Invalid workspace_id '${envelope.workspace_id}'. Use 1-128 characters: letters, numbers, dot, underscore, hyphen.`],
        [{ field: 'workspace_id', issue: 'Invalid or unsafe filesystem identifier.' }]);
    }
    if (!isSafeIdentifier(envelope.idempotency_key)) {
      return fail(envelope.type, opId, envelope.path || '', null,
        [`Invalid idempotency_key '${envelope.idempotency_key}'. Use 1-128 characters: letters, numbers, dot, underscore, hyphen.`],
        [{ field: 'idempotency_key', issue: 'Invalid or unsafe replay identifier.' }]);
    }

    let abs;
    try { abs = resolveContainedPath(vaultRoot, envelope.path); }
    catch (err) { return fail(envelope.type, opId, envelope.path, null, [err.message], [{ field: 'path', issue: err.message }]); }
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      return fail(envelope.type, opId, envelope.path, null,
        [`VFS path '${envelope.path}' resolves to a directory, not a file.`],
        [{ field: 'path', issue: 'Must identify a file.' }]);
    }

    // Stage 2 — Idempotency
    const hash = requestHash(envelope);
    warmFromAudit(vaultRoot, eventLogDir);
    pruneExpired();
    const ck = cacheKey(envelope.workspace_id, envelope.idempotency_key);
    const cached = idempotencyCache.get(ck);
    if (cached) {
      if (cached.request_hash && cached.request_hash !== hash) {
        return fail(envelope.type, opId, envelope.path, null,
          [`Idempotency conflict: key '${envelope.idempotency_key}' was already committed for a different request payload.`],
          [{ field: 'idempotency_key', issue: 'Same key cannot be reused for a different request payload.' }]);
      }
      return { ...cached.response, replay: cached.response };
    }

    // Stage 3 — Authorization (protocol-path hook)
    // Granular RBAC is now evaluated in Stage 5.5 once the primitive type is resolved.

    // Stage 4 — Lease check
    const store = options.leaseStore || leaseStore;
    if (store) {
      const lc = checkLease(envelope, store);
      if (!lc.ok) return fail(envelope.type, opId, envelope.path, null, [lc.error], [{ field: 'lease_id', issue: lc.error }]);
    }

    // Stage 5 — Content validation
    let resolvedType = null;
    let errors = [];
    let repair = [];
    let mergedForCommit = null;

    if (envelope.type === 'operation') {
      if (envelope.path.endsWith('/index.md')) {
        resolvedType = 'index';
      } else {
        const { data } = parseDocument(envelope.content);
        resolvedType = data.type || null;
        if (!resolvedType) { errors.push(`Missing required frontmatter field 'type' in ${envelope.path}.`); repair.push({ field: 'type', issue: 'Frontmatter must declare a type.' }); }
        else ({ errors, repair } = validateContent(resolvedType, data, envelope.path));
      }
      if (!errors.length && fs.existsSync(abs) && !envelope.path.endsWith('/index.md')) {
        const { data: existingData } = parseDocument(fs.readFileSync(abs, 'utf8'));
        if (existingData.type && existingData.type !== resolvedType) {
          errors.push(`Type rewrite refused for ${envelope.path}: existing type '${existingData.type}' cannot be replaced by '${resolvedType}'.`);
          repair.push({ field: 'type', issue: 'Use a migration controlled by a privileged host; operation writes may not change an existing file type.' });
        }
      }
      // append-type rewrite guard
      if (!errors.length && isAppendType(types.get(resolvedType)) && fs.existsSync(abs)) {
        const existing = parseDocument(fs.readFileSync(abs, 'utf8')).body.replace(/\s+$/, '');
        const next = parseDocument(envelope.content).body.replace(/\s+$/, '');
        if (existing && next !== existing && !next.startsWith(existing + '\n')) {
          errors.push(`Append-type '${resolvedType}' may not rewrite existing records.`);
          repair.push({ field: '__body__', issue: 'Append-only: existing records are immutable.' });
        }
      }
    } else if (envelope.type === 'patch') {
      if (!fs.existsSync(abs)) { errors.push(`Target file does not exist for patch: ${envelope.path}.`); repair.push({ field: 'path', issue: 'Patch target not found.' }); }
      else {
        const { data, body } = parseDocument(fs.readFileSync(abs, 'utf8'));
        if (Object.prototype.hasOwnProperty.call(envelope.patches, 'type') && envelope.patches.type !== data.type) {
          errors.push(`Patch may not change immutable field 'type' for ${envelope.path}.`);
          repair.push({ field: 'type', issue: 'Use an explicit migration rather than patching the primitive discriminator.' });
        }
        const merged = { ...data };
        for (const [k, v] of Object.entries(envelope.patches)) if (k !== '__body__') merged[k] = v;
        resolvedType = merged.type || null;
        const append = isAppendType(types.get(resolvedType));
        let newBody = body;
        if (envelope.patches.__body__ !== undefined) {
          if (append) newBody = body.replace(/\s+$/, '') + '\n' + envelope.patches.__body__;
          else newBody = envelope.patches.__body__;
        }
        ({ errors, repair } = resolvedType ? validateContent(resolvedType, merged, envelope.path) : { errors: ["Missing required field 'type'."], repair: [{ field: 'type', issue: 'No type after merge.' }] });
        mergedForCommit = { data: merged, body: newBody };
      }
    } else if (envelope.type === 'event') {
      try { JSON.parse(envelope.content); }
      catch { errors.push('Event content must be valid JSON.'); repair.push({ field: 'content', issue: 'Must be a JSON string.' }); }
    } else if (envelope.type === 'delete') {
      if (!fs.existsSync(abs)) { errors.push(`Target file does not exist for delete: ${envelope.path}.`); repair.push({ field: 'path', issue: 'Delete target not found.' }); }
      else {
        const { data } = parseDocument(fs.readFileSync(abs, 'utf8'));
        resolvedType = data.type || null;
        if (isAppendType(types.get(resolvedType))) { errors.push(`Append-type '${resolvedType}' may not be deleted.`); repair.push({ field: 'type', issue: 'Append-only documents are immutable.' }); }
      }
    }

    let valid = errors.length === 0;

    // Stage 5.5 — Granular Authorization (Default RBAC)
    if (valid) {
      // Fail-closed by design: a host that forgets to overwrite `actor` with a
      // verified identity (spec §6.3 Stage 3 MUST) gets denied, not admin. Only
      // an EXPLICIT actor.role === 'admin' still resolves to full access.
      const actorRole = envelope.actor?.role || null;
      // `event` envelopes never resolve a document-primitive type (they're a raw
      // log entry, not a typed file), so gate them on the `event` contract
      // primitive itself rather than the ever-null resolvedType (which would
      // otherwise require the unsatisfiable permission 'write:null').
      const permType = envelope.type === 'event' ? 'event' : resolvedType;
      const requiredPerm = `write:${permType}`;
      let allowed = false;
      if (actorRole === 'system') {
        allowed = true;
      } else if (actorRole) {
        let perms = [];
        if (actorRole === 'admin') perms = ['write:*', 'read:*'];
        const safeRole = isSafeIdentifier(actorRole);
        if (!safeRole) {
          perms = [];
        } else {
          const roleFile = path.join(vaultRoot, 'roles', actorRole, 'ROLE.md');
          if (fs.existsSync(roleFile)) {
            try {
              const { data } = parseDocument(fs.readFileSync(roleFile, 'utf8'));
              if (data.permissions) perms = data.permissions;
            } catch {}
          }
        }
        allowed = perms.includes('*:*') || perms.includes('write:*') || perms.includes(`*:${permType}`) || perms.includes(requiredPerm);
      }
      // else: actorRole is absent — allowed stays false (fail closed).

      if (!allowed) {
        errors.push(`Access denied: role '${actorRole || '(none)'}' lacks permission '${requiredPerm}'.`);
        repair.push({
          field: 'actor.role',
          issue: actorRole ? 'Insufficient permissions.' : 'Missing actor.role — the envelope was not authorized by a verified identity.',
        });
        valid = false;
      }
    }

    // dry_run: stop after stage 5
    if (envelope.dry_run || !valid) {
      const resp = {
        success: valid, type: envelope.type, operation_id: opId, path: envelope.path,
        committed_at: null, dry_run: !!envelope.dry_run,
        validation: { valid, type: resolvedType, errors, warnings },
      };
      if (!valid) resp.repair = { field_errors: repair };
      return resp;
    }

    // Stage 6 — Commit
    const committedAt = new Date().toISOString();
    try {
      if (envelope.type === 'operation') atomicWrite(abs, envelope.content);
      else if (envelope.type === 'patch') atomicWrite(abs, serializeDocument(mergedForCommit.data, mergedForCommit.body));
      else if (envelope.type === 'event') {
        appendEvent(vaultRoot, eventLogDir, {
          event_id: opId, event_type: 'log', ts: committedAt, workspace_id: envelope.workspace_id,
          subject: envelope.path, content: envelope.content, idempotency_key: envelope.idempotency_key,
        });
      } else if (envelope.type === 'delete') {
        fs.rmSync(abs, { force: true });
        // §6.2: a delete emits an auditable deletion event — history is never lost.
        appendEvent(vaultRoot, eventLogDir, {
          event_id: opId, event_type: 'delete', ts: committedAt, workspace_id: envelope.workspace_id,
          subject: envelope.path, resolved_type: resolvedType, idempotency_key: envelope.idempotency_key,
        });
      }
    } catch (err) {
      return fail(envelope.type, opId, envelope.path, resolvedType, [`Commit failed: ${err.message}`], [{ field: '(commit)', issue: err.message }]);
    }

    // Stage 7 — Audit
    try { audit(vaultRoot, eventLogDir, opId, committedAt, envelope, resolvedType, hash); } catch { /* non-fatal */ }

    const response = ok(envelope.type, opId, envelope.path, resolvedType, committedAt, warnings);
    idempotencyCache.set(ck, { response, request_hash: hash, ts: Date.now() });
    return response;
  }

  return { processOperation, resolveContainedPath, _types: types };
}

function checkLease(envelope, leaseStore) {
  if (!isSafeIdentifier(envelope.workspace_id)) return { ok: false, error: `Invalid workspace_id '${envelope.workspace_id}'.` };
  const pathKey = crypto.createHash('sha256').update(String(envelope.path)).digest('hex');
  const lp = path.join(leaseStore, envelope.workspace_id, `${pathKey}.lease.json`);
  if (!fs.existsSync(lp)) return { ok: true };
  try {
    const lease = JSON.parse(fs.readFileSync(lp, 'utf8'));
    if (new Date(lease.expires_at) < new Date()) { fs.rmSync(lp, { force: true }); return { ok: true }; }
    if (!envelope.lease_id) return { ok: false, error: `Path '${envelope.path}' is leased (${lease.lease_id}). Supply a matching lease_id.` };
    if (envelope.lease_id !== lease.lease_id) return { ok: false, error: `Lease mismatch for '${envelope.path}'.` };
    return { ok: true };
  } catch { return { ok: false, error: `Lease state for '${envelope.path}' is unreadable; refusing to fail open.` }; }
}
