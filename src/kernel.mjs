/**
 * SSSS 0.9 shared mutation kernel.
 * Hosts inject infrastructure adapters; this module owns ordering and semantics.
 */
import crypto from 'node:crypto';
import { parseDocument, serializeDocument } from './frontmatter.mjs';
import { createValidator } from './validator.mjs';
import { isAppendType, resolvePrimitiveDefinition } from './registry.mjs';
import { createCapabilityAuthorizer } from './authorization.mjs';
import { createCanonicalEvent } from './events.mjs';
import { MemoryIdempotencyStore } from './idempotency.mjs';

export { MemoryIdempotencyStore } from './idempotency.mjs';

const COMMAND_TYPES = new Set(['operation', 'patch', 'event', 'delete']);

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

function failure(envelope, operationId, errors, fieldErrors = []) {
  return {
    success: false,
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

  async function execute(rawEnvelope, context = {}) {
    const envelope = { ...rawEnvelope };
    delete envelope.actor;
    const operationId = envelope.operation_id || idGenerator();
    const principal = context.principal;

    if (!COMMAND_TYPES.has(envelope.type)) {
      return failure(envelope, operationId, [`Invalid command type '${envelope.type}'.`], [{ field: 'type', issue: 'Use operation, patch, event, or delete.' }]);
    }
    for (const field of ['workspace_id', 'idempotency_key', 'path']) {
      if (typeof envelope[field] !== 'string' || !envelope[field]) {
        return failure(envelope, operationId, [`Missing required field '${field}'.`], [{ field, issue: 'Required.' }]);
      }
    }
    if (envelope.type === 'operation' && typeof envelope.content !== 'string') {
      return failure(envelope, operationId, ['Operation content must be a string.'], [{ field: 'content', issue: 'Required string.' }]);
    }
    if (envelope.type === 'patch' && (!envelope.patches || typeof envelope.patches !== 'object')) {
      return failure(envelope, operationId, ['Patch requires a patches object.'], [{ field: 'patches', issue: 'Required object.' }]);
    }

    const requestHash = canonicalRequestHash(envelope, principal);
    const replay = await idempotencyStore.get(envelope.workspace_id, envelope.idempotency_key);
    if (replay) {
      if (replay.request_hash !== requestHash) {
        return failure(envelope, operationId, ['Idempotency key was already used for a different request.'], [{ field: 'idempotency_key', issue: 'Request hash conflict.' }]);
      }
      return { ...replay.response, replay: true };
    }

    let current;
    try { current = await vfs.read(envelope.path); }
    catch (error) { return failure(envelope, operationId, [error.message], [{ field: 'path', issue: error.message }]); }

    let definition = null;
    let declaredType = envelope.primitive_type || null;
    let nextContent = null;
    let nextData = null;
    let currentData = null;

    if (current) {
      try { currentData = parseDocument(current.bytes.toString('utf8')).data; }
      catch (error) { return failure(envelope, operationId, [`Existing document is invalid: ${error.message}`]); }
      declaredType ||= currentData.type;
    }
    if (envelope.type === 'operation') {
      if (envelope.path.endsWith('/index.md')) {
        declaredType = 'index';
        definition = { type: 'index', qualified_type: 'ssss:index', primitive_version: 1, capabilities: {} };
        nextContent = envelope.content;
        nextData = {};
      } else {
        const validation = validator.validateDocument(envelope.content, { resolveReference: context.resolveReference });
        if (!validation.valid) return failure(envelope, operationId, validation.errors, validation.field_errors);
        declaredType = validation.declared_type;
        definition = resolvePrimitiveDefinition(registrySet, declaredType);
        nextContent = envelope.content;
        nextData = validation.data;
      }
      if (currentData?.type && currentData.type !== nextData.type) {
        return failure(envelope, operationId, ['Operation may not change an existing document type.'], [{ field: 'type', issue: 'Use an explicit migration.' }]);
      }
    } else if (envelope.type === 'patch') {
      if (!current) return failure(envelope, operationId, ['Patch target does not exist.'], [{ field: 'path', issue: 'Target not found.' }]);
      definition = resolvePrimitiveDefinition(registrySet, declaredType);
      if (!definition) return failure(envelope, operationId, [`Unknown SSSS primitive '${declaredType}'.`], [{ field: 'type', issue: 'Unknown primitive.' }]);
      if (Object.hasOwn(envelope.patches, 'type') && envelope.patches.type !== currentData.type) {
        return failure(envelope, operationId, ['Patch may not change document type.'], [{ field: 'type', issue: 'Use an explicit migration.' }]);
      }
      nextData = { ...currentData, ...Object.fromEntries(Object.entries(envelope.patches).filter(([key]) => key !== '__body__')) };
      for (const field of definition.immutable_fields || []) {
        if (Object.hasOwn(envelope.patches, field) && JSON.stringify(currentData[field]) !== JSON.stringify(nextData[field])) {
          return failure(envelope, operationId, [`Patch may not change immutable field '${field}'.`], [{ field, issue: 'Use an explicit migration.' }]);
        }
      }
      const parsedCurrent = parseDocument(current.bytes.toString('utf8'));
      const appendOnly = isAppendType(definition);
      let body = parsedCurrent.body;
      if (envelope.patches.__body__ !== undefined) {
        body = appendOnly ? `${body.replace(/\s+$/, '')}\n${envelope.patches.__body__}` : String(envelope.patches.__body__);
      }
      const validation = validator.validateData(nextData, { resolveReference: context.resolveReference });
      if (!validation.valid) return failure(envelope, operationId, validation.errors, validation.field_errors);
      nextContent = serializeDocument(nextData, body);
    } else if (envelope.type === 'delete') {
      if (!current) return failure(envelope, operationId, ['Delete target does not exist.'], [{ field: 'path', issue: 'Target not found.' }]);
      definition = resolvePrimitiveDefinition(registrySet, declaredType);
      if (!definition) return failure(envelope, operationId, [`Unknown SSSS primitive '${declaredType}'.`]);
      if (isAppendType(definition)) return failure(envelope, operationId, [`Append-only primitive '${declaredType}' cannot be deleted.`]);
    } else {
      definition = { type: 'event', qualified_type: 'ssss:event', primitive_version: 1, capabilities: { event: ['write:event'] } };
      try { if (typeof envelope.content === 'string') JSON.parse(envelope.content); }
      catch { return failure(envelope, operationId, ['Event content must be valid JSON.'], [{ field: 'content', issue: 'Expected JSON string.' }]); }
    }

    const appendOnly = isAppendType(definition);
    const action = actionFor(envelope, !!current, appendOnly);
    const auth = await authorize({ principal, workspaceId: envelope.workspace_id, definition, action, context });
    if (!auth.allowed) return failure(envelope, operationId, [`Access denied: ${auth.reason}`], [{ field: 'principal', issue: auth.reason }]);

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
        return failure(envelope, operationId, [`Lease state is unreadable: ${error.message}`], [{ field: 'lease_id', issue: 'Lease state is unreadable.' }]);
      }
      if (!lease.valid) return failure(envelope, operationId, [lease.reason], [{ field: 'lease_id', issue: lease.reason }]);
    }

    let resourceState = null;
    if (resourceCoordinator?.prepare) {
      try { resourceState = await resourceCoordinator.prepare({ envelope, principal, definition, action, current, nextContent }); }
      catch (error) { return failure(envelope, operationId, [`Resource prepare failed: ${error.message}`]); }
    }

    if (envelope.dry_run) {
      return {
        success: true, type: envelope.type, operation_id: operationId, path: envelope.path,
        committed_at: null, dry_run: true,
        validation: { valid: true, type: definition.qualified_type, errors: [], warnings: [] },
      };
    }

    let commit = null;
    try {
      if (envelope.type === 'operation') {
        commit = await vfs.writeAtomic(envelope.path, nextContent, current ? { version: current.version } : { ifAbsent: true });
      } else if (envelope.type === 'patch') {
        commit = await vfs.writeAtomic(envelope.path, nextContent, { version: current.version });
      } else if (envelope.type === 'delete') {
        commit = await vfs.remove(envelope.path, { version: current.version });
      }

      const event = createCanonicalEvent({
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
        resource_status: resourceState ? 'prepared' : null,
        payload: envelope.type === 'event' && envelope.content ? JSON.parse(envelope.content) : null,
      }, { clock });
      await eventStore.append(event);

      if (resourceCoordinator?.finalize) await resourceCoordinator.finalize({ resourceState, event });
      const projectionResults = projectionCoordinator ? await projectionCoordinator.dispatch(event) : [];
      const warnings = projectionResults.filter((item) => !item.success).map((item) => `Projection '${item.id}' failed: ${item.error}`);
      const response = {
        success: true, type: envelope.type, operation_id: operationId, path: envelope.path,
        committed_at: event.timestamp, dry_run: false,
        event_id: event.event_id,
        validation: { valid: true, type: definition.qualified_type, errors: [], warnings },
      };
      await idempotencyStore.put(envelope.workspace_id, envelope.idempotency_key, { request_hash: requestHash, response });
      return response;
    } catch (error) {
      if (resourceCoordinator?.reconcile) {
        try { await resourceCoordinator.reconcile({ resourceState, error, envelope, principal }); } catch {}
      }
      // Roll back a VFS commit when event persistence fails. Event envelopes have no VFS commit.
      if (commit && envelope.type !== 'event') {
        try {
          if (!current) await vfs.remove(envelope.path, { version: commit.version });
          else await vfs.writeAtomic(envelope.path, current.bytes, commit.version ? { version: commit.version } : {});
        } catch (rollbackError) {
          return failure(envelope, operationId, [`Commit failed: ${error.message}; rollback failed: ${rollbackError.message}`]);
        }
      }
      return failure(envelope, operationId, [`Commit failed: ${error.message}`]);
    }
  }

  return { execute, registry: registrySet, validator };
}
