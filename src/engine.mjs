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

const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

function cacheKey(wid, key) { return `${wid}:${key}`; }

/** festech `resolveContainedPath`: resolve a VFS path, refusing escape from the vault. */
export function resolveContainedPath(vaultRoot, vfsPath) {
  const root = path.resolve(vaultRoot);
  const cleaned = String(vfsPath).replace(/^\/+/, '');
  const resolved = path.resolve(root, cleaned);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Path traversal refused: ${vfsPath}`);
  }
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
  const { types } = loadRegistries(registryDir);
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
            response: ok(r.payload.envelope_type, r.correlation_id, r.subject, r.payload.resolved_type, r.ts),
          });
        }
      } catch { /* skip corrupt line */ }
    }
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
    for (const f of def.required_fields || []) {
      const v = data[f];
      const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
      if (empty) {
        errors.push(`Missing required field '${f}' for type '${resolvedType}' in ${filePath}.`);
        repair.push({ field: f, issue: `Missing required field '${f}' for type '${resolvedType}'.` });
      }
    }
    return { errors, repair };
  }

  function appendEvent(vaultRoot, eventLogDir, record) {
    const dir = eventLogDir || path.join(vaultRoot, '.events');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, `${record.workspace_id}.jsonl`), JSON.stringify(record) + '\n');
  }

  function audit(vaultRoot, eventLogDir, opId, committedAt, envelope, resolvedType) {
    const dir = eventLogDir || path.join(vaultRoot, '.events');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'audit.jsonl'), JSON.stringify({
      event_id: crypto.randomUUID(), event_type: 'audit', correlation_id: opId,
      ts: committedAt, subject: envelope.path,
      payload: {
        envelope_type: envelope.type, idempotency_key: envelope.idempotency_key,
        workspace_id: envelope.workspace_id, resolved_type: resolvedType,
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

    let abs;
    try { abs = resolveContainedPath(vaultRoot, envelope.path); }
    catch (err) { return fail(envelope.type, opId, envelope.path, null, [err.message], [{ field: 'path', issue: err.message }]); }

    // Stage 2 — Idempotency
    warmFromAudit(vaultRoot, eventLogDir);
    pruneExpired();
    const ck = cacheKey(envelope.workspace_id, envelope.idempotency_key);
    const cached = idempotencyCache.get(ck);
    if (cached) return { ...cached.response, replay: cached.response };

    // Stage 3 — Authorization (protocol-path hook; default admin)
    // (kept minimal; agentRole-based protected paths can be layered by a host)

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
      const { data } = parseDocument(envelope.content);
      resolvedType = data.type || null;
      if (!resolvedType) { errors.push(`Missing required frontmatter field 'type' in ${envelope.path}.`); repair.push({ field: 'type', issue: 'Frontmatter must declare a type.' }); }
      else ({ errors, repair } = validateContent(resolvedType, data, envelope.path));
      // append-type rewrite guard
      if (!errors.length && isAppendType(types.get(resolvedType)) && fs.existsSync(abs)) {
        const existing = parseDocument(fs.readFileSync(abs, 'utf8')).body.trim();
        const next = parseDocument(envelope.content).body.trim();
        if (existing && !next.startsWith(existing)) { errors.push(`Append-type '${resolvedType}' may not rewrite existing records.`); repair.push({ field: '__body__', issue: 'Append-only: existing records are immutable.' }); }
      }
    } else if (envelope.type === 'patch') {
      if (!fs.existsSync(abs)) { errors.push(`Target file does not exist for patch: ${envelope.path}.`); repair.push({ field: 'path', issue: 'Patch target not found.' }); }
      else {
        const { data, body } = parseDocument(fs.readFileSync(abs, 'utf8'));
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

    const valid = errors.length === 0;

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
    try { audit(vaultRoot, eventLogDir, opId, committedAt, envelope, resolvedType); } catch { /* non-fatal */ }

    const response = ok(envelope.type, opId, envelope.path, resolvedType, committedAt, warnings);
    idempotencyCache.set(ck, { response, ts: Date.now() });
    return response;
  }

  return { processOperation, resolveContainedPath, _types: types };
}

function checkLease(envelope, leaseStore) {
  const lp = path.join(leaseStore, envelope.workspace_id, `${String(envelope.path).replace(/\//g, '__')}.lease.json`);
  if (!fs.existsSync(lp)) return { ok: true };
  try {
    const lease = JSON.parse(fs.readFileSync(lp, 'utf8'));
    if (new Date(lease.expires_at) < new Date()) { fs.rmSync(lp, { force: true }); return { ok: true }; }
    if (!envelope.lease_id) return { ok: false, error: `Path '${envelope.path}' is leased (${lease.lease_id}). Supply a matching lease_id.` };
    if (envelope.lease_id !== lease.lease_id) return { ok: false, error: `Lease mismatch for '${envelope.path}'.` };
    return { ok: true };
  } catch { return { ok: true }; }
}
