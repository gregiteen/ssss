/**
 * SSSS 0.9 shared mutation kernel.
 * Hosts inject infrastructure adapters; this module owns ordering and semantics.
 */
import crypto from 'node:crypto';
import { parseDocument, serializeDocument } from './frontmatter.mjs';
import { createValidator } from './validator.mjs';
import { isAppendType, isSafeDocumentPath, resolvePrimitiveDefinition } from './registry.mjs';
import { createCapabilityAuthorizer, validateVerifiedPrincipal } from './authorization.mjs';
import { createCanonicalEvent, idempotentEventId } from './events.mjs';
import { MemoryIdempotencyStore } from './idempotency.mjs';

export { MemoryIdempotencyStore } from './idempotency.mjs';

const COMMAND_TYPES = new Set(['operation', 'patch', 'event', 'delete']);

/**
 * Symbolic failure codes (spec §6.5). Every failed response carries exactly one
 * in `error.code`; transports map codes to status without parsing messages.
 */
export const ERROR_CODES = Object.freeze([
  'invalid_request', 'unauthorized', 'forbidden', 'not_found', 'lease_conflict',
  'version_conflict', 'idempotency_conflict', 'validation_failed', 'internal_error',
]);

function isVfsError(error, name, code) { return error?.name === name || error?.code === code; }

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

export function canonicalRequestHash(envelope, principal) {
  const clean = {
    type: envelope?.type,
    workspace_id: envelope?.workspace_id,
    idempotency_key: envelope?.idempotency_key,
    path: envelope?.path,
    primitive_type: envelope?.primitive_type,
    content: envelope?.content,
    patches: envelope?.patches,
    verified_principal_id: principal?.id || null,
  };
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(stable(clean))).digest('hex')}`;
}

function failure(code, envelope, operationId, errors, fieldErrors = []) {
  return {
    success: false,
    error: { code, message: errors[0] || code },
    type: envelope?.type || null,
    operation_id: operationId,
    path: envelope?.path || '',
    committed_at: null,
    dry_run: !!envelope?.dry_run,
    validation: { valid: false, type: null, errors, warnings: [] },
    repair: { field_errors: fieldErrors.length ? fieldErrors : errors.map((issue) => ({ field: '(root)', issue })) },
  };
}

function actionFor(envelope, exists, appendOnly) {
  if (envelope.type === 'operation') return exists ? 'replace' : 'create';
  if (envelope.type === 'patch') return appendOnly && envelope.patches?.__body__ !== undefined ? 'append' : 'patch';
  return envelope.type;
}

export function createKernel(options = {}) {
  const {
    vfs,
    eventStore,
    projectionCoordinator,
    leaseStore = null,
    idempotencyStore = new MemoryIdempotencyStore(),
    authorize = createCapabilityAuthorizer(),
    resourceCoordinator = null,
    clock = () => new Date().toISOString(),
    idGenerator = () => crypto.randomUUID(),
  } = options;
  if (!vfs) throw new Error('createKernel requires a VFS adapter.');
  if (!eventStore) throw new Error('createKernel requires an event store.');
  const validator = options.validator || createValidator(options);
  const registrySet = validator.registry;

  // Registry `references` are enforced on every write (spec §9). A host may
  // supply its own resolver; otherwise targets are read through the VFS.
  async function referenceResolver(definition, data, context) {
    if (context.resolveReference) return context.resolveReference;
    const fields = Object.keys(definition?.references || {});
    if (!fields.length || !data) return undefined;
    const found = new Map();
    for (const field of fields) {
      const target = data[field];
      if (!isSafeDocumentPath(target) || found.has(target)) continue;
      let entry = null;
      try {
        const file = await vfs.read(target);
        if (file) {
          const content = file.bytes.toString('utf8');
          entry = { content, data: parseDocument(content).data };
        }
      } catch {}
      found.set(target, entry);
    }
    return (target) => found.get(target) || null;
  }

  async function execute(rawEnvelope, context = {}) {
    const envelope = { ...rawEnvelope };
    delete envelope.actor;
    const operationId = envelope.operation_id || idGenerator();
    const principal = context.principal;

    if (!COMMAND_TYPES.has(envelope.type)) {
      return failure('invalid_request', envelope, operationId, [`Invalid command type '${envelope.type}'.`], [{ field: 'type', issue: 'Use operation, patch, event, or delete.' }]);
    }
    for (const field of ['workspace_id', 'idempotency_key', 'path']) {
      if (typeof envelope[field] !== 'string' || !envelope[field]) {
        return failure('invalid_request', envelope, operationId, [`Missing required field '${field}'.`], [{ field, issue: 'Required.' }]);
      }
    }
    if (envelope.type === 'operation' && typeof envelope.content !== 'string') {
      return failure('invalid_request', envelope, operationId, ['Operation content must be a string.'], [{ field: 'content', issue: 'Required string.' }]);
    }
    if (envelope.type === 'patch' && (!envelope.patches || typeof envelope.patches !== 'object')) {
      return failure('invalid_request', envelope, operationId, ['Patch requires a patches object.'], [{ field: 'patches', issue: 'Required object.' }]);
    }

    // Authenticate before touching storage, so an anonymous caller learns
    // nothing about the vault. The id and kind are what every event records.
    if (!principal || typeof principal.id !== 'string' || !principal.id || typeof principal.kind !== 'string' || !principal.kind) {
      return failure('unauthorized', envelope, operationId, ['Access denied: Verified principal is required.'], [{ field: 'principal', issue: 'Verified principal is required.' }]);
    }

    const requestHash = canonicalRequestHash(envelope, principal);
    // A stored result for this key: replay it, or refuse a different request.
    const settled = async () => {
      const stored = await idempotencyStore.get(envelope.workspace_id, envelope.idempotency_key);
      if (!stored) return null;
      if (stored.request_hash !== requestHash) {
        return failure('idempotency_conflict', envelope, operationId, ['Idempotency key was already used for a different request.'], [{ field: 'idempotency_key', issue: 'Request hash conflict.' }]);
      }
      return { ...stored.response, replay: true };
    };
    const replay = await settled();
    if (replay) return replay;

    let current;
    try { current = await vfs.read(envelope.path); }
    catch (error) {
      const code = isVfsError(error, 'VfsPathError', 'SSSS_VFS_PATH') ? 'invalid_request' : 'internal_error';
      return failure(code, envelope, operationId, [error.message], [{ field: 'path', issue: error.message }]);
    }

    let definition = null;
    let declaredType = envelope.primitive_type || null;
    let nextContent = null;
    let nextData = null;
    let currentData = null;

    if (current) {
      try { currentData = parseDocument(current.bytes.toString('utf8')).data; }
      catch (error) { return failure('internal_error', envelope, operationId, [`Existing document is invalid: ${error.message}`]); }
      declaredType ||= currentData.type;
    }
    if (envelope.type === 'operation') {
      if (envelope.path.endsWith('/index.md')) {
        declaredType = 'index';
        definition = { type: 'index', qualified_type: 'ssss:index', primitive_version: 1, capabilities: {} };
        nextContent = envelope.content;
        nextData = {};
      } else {
        let draft = null;
        try { draft = parseDocument(envelope.content).data; } catch {}
        const draftDefinition = draft && resolvePrimitiveDefinition(registrySet, draft.type);
        const resolveReference = await referenceResolver(draftDefinition, draft, context);
        const validation = validator.validateDocument(envelope.content, { resolveReference });
        if (!validation.valid) return failure('validation_failed', envelope, operationId, validation.errors, validation.field_errors);
        declaredType = validation.declared_type;
        definition = resolvePrimitiveDefinition(registrySet, declaredType);
        nextContent = envelope.content;
        nextData = validation.data;
      }
      if (currentData?.type && currentData.type !== nextData.type) {
        return failure('validation_failed', envelope, operationId, ['Operation may not change an existing document type.'], [{ field: 'type', issue: 'Use an explicit migration.' }]);
      }
      // A full replace would rewrite recorded history (spec §5.3).
      if (current && isAppendType(definition)) {
        return failure('validation_failed', envelope, operationId, [`Append-only primitive '${declaredType}' cannot be replaced.`], [{ field: 'content', issue: 'Append with a patch carrying __body__.' }]);
      }
    } else if (envelope.type === 'patch') {
      if (!current) return failure('not_found', envelope, operationId, ['Patch target does not exist.'], [{ field: 'path', issue: 'Target not found.' }]);
      definition = resolvePrimitiveDefinition(registrySet, declaredType);
      if (!definition) return failure('validation_failed', envelope, operationId, [`Unknown SSSS primitive '${declaredType}'.`], [{ field: 'type', issue: 'Unknown primitive.' }]);
      if (Object.hasOwn(envelope.patches, 'type') && envelope.patches.type !== currentData.type) {
        return failure('validation_failed', envelope, operationId, ['Patch may not change document type.'], [{ field: 'type', issue: 'Use an explicit migration.' }]);
      }
      nextData = { ...currentData, ...Object.fromEntries(Object.entries(envelope.patches).filter(([key]) => key !== '__body__')) };
      for (const field of definition.immutable_fields || []) {
        if (Object.hasOwn(envelope.patches, field) && JSON.stringify(currentData[field]) !== JSON.stringify(nextData[field])) {
          return failure('validation_failed', envelope, operationId, [`Patch may not change immutable field '${field}'.`], [{ field, issue: 'Use an explicit migration.' }]);
        }
      }
      const parsedCurrent = parseDocument(current.bytes.toString('utf8'));
      const appendOnly = isAppendType(definition);
      let body = parsedCurrent.body;
      if (envelope.patches.__body__ !== undefined) {
        body = appendOnly ? `${body.replace(/\s+$/, '')}\n${envelope.patches.__body__}` : String(envelope.patches.__body__);
      }
      const resolveReference = await referenceResolver(definition, nextData, context);
      const validation = validator.validateData(nextData, { resolveReference });
      if (!validation.valid) return failure('validation_failed', envelope, operationId, validation.errors, validation.field_errors);
      nextContent = serializeDocument(nextData, body);
    } else if (envelope.type === 'delete') {
      if (!current) return failure('not_found', envelope, operationId, ['Delete target does not exist.'], [{ field: 'path', issue: 'Target not found.' }]);
      definition = resolvePrimitiveDefinition(registrySet, declaredType);
      if (!definition) return failure('validation_failed', envelope, operationId, [`Unknown SSSS primitive '${declaredType}'.`]);
      if (isAppendType(definition)) return failure('validation_failed', envelope, operationId, [`Append-only primitive '${declaredType}' cannot be deleted.`]);
    } else {
      definition = { type: 'event', qualified_type: 'ssss:event', primitive_version: 1, capabilities: { event: ['write:event'] } };
      try { if (typeof envelope.content === 'string') JSON.parse(envelope.content); }
      catch { return failure('invalid_request', envelope, operationId, ['Event content must be valid JSON.'], [{ field: 'content', issue: 'Expected JSON string.' }]); }
    }

    const appendOnly = isAppendType(definition);
    const action = actionFor(envelope, !!current, appendOnly);
    const auth = await authorize({ principal, workspaceId: envelope.workspace_id, definition, action, context });
    if (!auth.allowed) {
      // An absent or malformed principal is an authentication failure, not a permission one.
      const code = validateVerifiedPrincipal(principal).valid ? 'forbidden' : 'unauthorized';
      return failure(code, envelope, operationId, [`Access denied: ${auth.reason}`], [{ field: 'principal', issue: auth.reason }]);
    }

    if ((definition?.lease_required || context.requireLease) && leaseStore) {
      let lease;
      try {
        lease = await leaseStore.verify({
          workspace_id: envelope.workspace_id,
          target: envelope.path,
          principal_id: principal.id,
          operation_id: operationId,
          lease_id: envelope.lease_id,
        });
      } catch (error) {
        return failure('internal_error', envelope, operationId, [`Lease state is unreadable: ${error.message}`], [{ field: 'lease_id', issue: 'Lease state is unreadable.' }]);
      }
      if (!lease.valid) return failure('lease_conflict', envelope, operationId, [lease.reason], [{ field: 'lease_id', issue: lease.reason }]);
    }

    let resourceState = null;
    let prepared = false;
    if (resourceCoordinator?.prepare) {
      try {
        resourceState = await resourceCoordinator.prepare({ envelope, principal, definition, action, current, nextContent });
        prepared = true;
      }
      catch (error) { return failure('internal_error', envelope, operationId, [`Resource prepare failed: ${error.message}`]); }
    }

    // Every prepare ends in exactly one finalize or reconcile; a dry run never commits.
    const reconcile = async (phase, error) => {
      if (!resourceCoordinator?.reconcile) return null;
      try { await resourceCoordinator.reconcile({ resourceState, error, envelope, principal, phase }); return null; }
      catch (reconcileError) { return reconcileError; }
    };

    if (envelope.dry_run) {
      if (prepared) await reconcile('dry_run', null);
      return {
        success: true, type: envelope.type, operation_id: operationId, path: envelope.path,
        committed_at: null, dry_run: true,
        validation: { valid: true, type: definition.qualified_type, errors: [], warnings: [] },
      };
    }

    let commit = null;
    let event;
    try {
      if (envelope.type === 'operation') {
        commit = await vfs.writeAtomic(envelope.path, nextContent, current ? { version: current.version } : { ifAbsent: true });
      } else if (envelope.type === 'patch') {
        commit = await vfs.writeAtomic(envelope.path, nextContent, { version: current.version });
      } else if (envelope.type === 'delete') {
        commit = await vfs.remove(envelope.path, { version: current.version });
      }

      event = createCanonicalEvent({
        // `event` envelopes have no VFS compare-and-swap, so a key-derived id
        // lets the event store reject a concurrent request with the same key.
        event_id: envelope.type === 'event' ? idempotentEventId(envelope.workspace_id, envelope.idempotency_key) : undefined,
        workspace_id: envelope.workspace_id,
        primitive_id: definition.qualified_type,
        primitive_version: definition.primitive_version || 1,
        action,
        subject: envelope.path,
        principal,
        operation_id: operationId,
        idempotency_key: envelope.idempotency_key,
        request_hash: requestHash,
        before_hash: current?.hash || null,
        after_hash: commit?.hash || null,
        changed_fields: envelope.type === 'patch' ? Object.keys(envelope.patches).sort() : [],
        resource_status: prepared ? 'prepared' : null,
        payload: envelope.type === 'event' && envelope.content ? JSON.parse(envelope.content) : null,
      }, { clock });
      await eventStore.append(event);
    } catch (error) {
      if (prepared) await reconcile('commit', error);
      // Roll back a VFS commit when event persistence fails. Event envelopes have no VFS commit.
      if (commit && envelope.type !== 'event') {
        try {
          if (!current) await vfs.remove(envelope.path, { version: commit.version });
          else await vfs.writeAtomic(envelope.path, current.bytes, commit.version ? { version: commit.version } : {});
        } catch (rollbackError) {
          return failure('internal_error', envelope, operationId, [`Commit failed: ${error.message}; rollback failed: ${rollbackError.message}`]);
        }
      }
      // A concurrent request with the same key may have won the commit (VFS
      // compare-and-swap or duplicate event_id); answer with its result.
      try {
        const winner = await settled();
        if (winner) return winner;
      } catch {}
      const code = isVfsError(error, 'VfsConflictError', 'SSSS_VFS_CONFLICT') ? 'version_conflict' : 'internal_error';
      return failure(code, envelope, operationId, [`Commit failed: ${error.message}`]);
    }

    // The appended event is the commit point (spec §6.3): nothing after it may
    // roll the mutation back. Post-commit failures become warnings.
    const warnings = [];
    if (resourceCoordinator?.finalize) {
      try { await resourceCoordinator.finalize({ resourceState, event }); }
      catch (error) {
        warnings.push(`Resource finalize failed: ${error.message}`);
        const reconcileError = await reconcile('finalize', error);
        if (reconcileError) warnings.push(`Resource reconcile failed: ${reconcileError.message}`);
      }
    }
    let projectionResults = [];
    if (projectionCoordinator) {
      try { projectionResults = await projectionCoordinator.dispatch(event); }
      catch (error) { warnings.push(`Projection dispatch failed: ${error.message}`); }
    }
    warnings.push(...projectionResults.filter((item) => !item.success).map((item) => `Projection '${item.id}' failed: ${item.error}`));
    const response = {
      success: true, type: envelope.type, operation_id: operationId, path: envelope.path,
      committed_at: event.timestamp, dry_run: false,
      event_id: event.event_id,
      validation: { valid: true, type: definition.qualified_type, errors: [], warnings },
    };
    try { await idempotencyStore.put(envelope.workspace_id, envelope.idempotency_key, { request_hash: requestHash, response }); }
    catch (error) { warnings.push(`Idempotency record failed: ${error.message}`); }
    return response;
  }

  return { execute, registry: registrySet, validator };
}
