/** Replayable, cursor-aware SSSS projection coordinator and host adapter examples. */
import crypto from 'node:crypto';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

export function projectionHash(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;
}

/**
 * Reference projection destination adapters.
 * Hosts own durable destination writes; these prove the shared apply/reset/snapshot contract.
 */
export function createSqlProjectionAdapter({ table = 'ssss_events' } = {}) {
  const rows = new Map();
  return {
    id: `sql:${table}`,
    kind: 'sql',
    apply: async (event) => {
      rows.set(event.event_id, {
        event_id: event.event_id,
        subject: event.subject,
        action: event.action,
        after_hash: event.after_hash,
        workspace_id: event.workspace_id,
      });
    },
    reset: async () => rows.clear(),
    snapshot: async () => Object.fromEntries([...rows.entries()].sort()),
  };
}

export function createSearchProjectionAdapter({ index = 'ssss' } = {}) {
  const documents = new Map();
  return {
    id: `search:${index}`,
    kind: 'search',
    apply: async (event) => {
      documents.set(event.subject, {
        subject: event.subject,
        terms: [event.action, event.primitive_id, event.subject].filter(Boolean).join(' '),
        after_hash: event.after_hash,
      });
    },
    reset: async () => documents.clear(),
    snapshot: async () => Object.fromEntries([...documents.entries()].sort()),
  };
}

export function createQueueProjectionAdapter({ topic = 'ssss.mutations' } = {}) {
  const messages = [];
  return {
    id: `queue:${topic}`,
    kind: 'queue',
    apply: async (event) => {
      messages.push({ topic, event_id: event.event_id, subject: event.subject, action: event.action });
    },
    reset: async () => { messages.length = 0; },
    snapshot: async () => messages.map((message) => ({ ...message })),
  };
}

export function createViewModelProjectionAdapter({ view = 'detail' } = {}) {
  const models = new Map();
  return {
    id: `view:${view}`,
    kind: 'view_model',
    apply: async (event) => {
      models.set(event.subject, {
        subject: event.subject,
        version: event.after_hash || event.before_hash || null,
        last_action: event.action,
        principal_id: event.principal?.id || null,
      });
    },
    reset: async () => models.clear(),
    snapshot: async () => Object.fromEntries([...models.entries()].sort()),
  };
}

export class ProjectionCoordinator {
  constructor({ eventStore, cursorStore = new Map() } = {}) {
    if (!eventStore) throw new Error('ProjectionCoordinator requires an eventStore.');
    this.eventStore = eventStore;
    this.cursorStore = cursorStore;
    this.projections = new Map();
  }
  register(definition) {
    if (!definition?.id || typeof definition.apply !== 'function') throw new Error('Projection id and apply(event, context) are required.');
    if (this.projections.has(definition.id)) throw new Error(`Duplicate projection '${definition.id}'.`);
    this.projections.set(definition.id, definition);
  }
  async replay(id, options = {}) {
    const projection = this.projections.get(id);
    if (!projection) throw new Error(`Unknown projection '${id}'.`);
    let cursor = options.rebuild ? 0 : (this.cursorStore.get(id) || 0);
    if (options.rebuild && projection.reset) await projection.reset();
    let applied = 0;
    for await (const item of this.eventStore.replay({ cursor, workspaceId: options.workspaceId })) {
      if (!projection.filter || projection.filter(item.event)) {
        await projection.apply(item.event, { replay: true, cursor: item.cursor });
        applied++;
      }
      cursor = item.cursor;
      this.cursorStore.set(id, cursor);
    }
    const state = projection.snapshot ? await projection.snapshot() : null;
    return { id, cursor, applied, output_hash: state === null ? null : projectionHash(state) };
  }
  async dispatch(event) {
    const results = [];
    for (const projection of this.projections.values()) {
      if (projection.filter && !projection.filter(event)) continue;
      try {
        await projection.apply(event, { replay: false });
        results.push({ id: projection.id, success: true });
      } catch (error) {
        results.push({ id: projection.id, success: false, error: error.message });
      }
    }
    return results;
  }
  async detectDrift(id, expectedHash) {
    const projection = this.projections.get(id);
    if (!projection?.snapshot) throw new Error(`Projection '${id}' does not expose snapshot().`);
    const actualHash = projectionHash(await projection.snapshot());
    return { drift: actualHash !== expectedHash, expected_hash: expectedHash, actual_hash: actualHash };
  }
}
