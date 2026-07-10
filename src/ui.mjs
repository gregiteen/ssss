/** Typed, capability-bound generative UI projection contract. */
import crypto from 'node:crypto';

const SAFE_ID = /^[a-z][a-z0-9_.-]{0,127}$/;
const LAYOUTS = new Set(['form', 'table', 'detail', 'detail-with-actions', 'dashboard', 'wizard']);

function isRecord(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }

export class UiRegistry {
  constructor() { this.components = new Map(); this.actions = new Map(); }
  registerComponent(definition) {
    if (!SAFE_ID.test(definition?.id || '') || typeof definition.validateProps !== 'function') throw new Error('Component id and validateProps are required.');
    if (this.components.has(definition.id)) throw new Error(`Duplicate UI component '${definition.id}'.`);
    this.components.set(definition.id, { ...definition });
  }
  registerAction(definition) {
    if (!SAFE_ID.test(definition?.id || '') || !definition.capability || !definition.command) throw new Error('Action id, capability, and command are required.');
    if (this.actions.has(definition.id)) throw new Error(`Duplicate UI action '${definition.id}'.`);
    this.actions.set(definition.id, { ...definition });
  }
}

export function validateUiManifest(manifest, { registry, visibleFields = [], grantedCapabilities = [], maxComponents = 100 } = {}) {
  const errors = [];
  if (!isRecord(manifest)) return { valid: false, errors: [{ field: '(root)', issue: 'UI manifest must be an object.' }] };
  if (manifest.type !== 'ssss:ui_projection') errors.push({ field: 'type', issue: 'Expected ssss:ui_projection.' });
  if (!LAYOUTS.has(manifest.layout)) errors.push({ field: 'layout', issue: `Use one of: ${[...LAYOUTS].join(', ')}.` });
  if (!Array.isArray(manifest.components)) errors.push({ field: 'components', issue: 'Components must be an array.' });
  else if (manifest.components.length > maxComponents) errors.push({ field: 'components', issue: `At most ${maxComponents} components are allowed.` });
  const allowedFields = new Set(visibleFields);
  const capabilities = new Set(grantedCapabilities);
  for (const [index, component] of (manifest.components || []).entries()) {
    const prefix = `components[${index}]`;
    if (!isRecord(component)) { errors.push({ field: prefix, issue: 'Component must be an object.' }); continue; }
    const definition = registry?.components.get(component.component);
    if (!definition) { errors.push({ field: `${prefix}.component`, issue: `Unregistered component '${component.component}'.` }); continue; }
    if (component.bind && !allowedFields.has(component.bind)) errors.push({ field: `${prefix}.bind`, issue: `Field '${component.bind}' is hidden or unknown.` });
    if (!isRecord(component.props) || typeof component.props.label !== 'string' || !component.props.label.trim()) {
      errors.push({ field: `${prefix}.props.label`, issue: 'An accessible label is required.' });
    }
    if (component.action) {
      const action = registry.actions.get(component.action);
      if (!action) errors.push({ field: `${prefix}.action`, issue: `Unregistered action '${component.action}'.` });
      else if (!capabilities.has(action.capability) && !capabilities.has('*:*')) errors.push({ field: `${prefix}.action`, issue: `Missing capability '${action.capability}'.` });
    }
    const propIssues = definition.validateProps(component.props || {});
    for (const issue of propIssues || []) errors.push({ field: `${prefix}.props.${issue.field || '(root)'}`, issue: issue.issue || String(issue) });
  }
  return { valid: errors.length === 0, errors };
}

export function createDeterministicUi(definition, options = {}) {
  const fields = (options.visibleFields || definition.fields || []).map((field) => typeof field === 'string' ? { id: field, name: field, kind: 'string' } : field);
  return {
    type: 'ssss:ui_projection',
    projection_id: `ui_${crypto.createHash('sha256').update(`${definition.primitive_id || definition.qualified_type}\0${options.mode || 'form'}`).digest('hex').slice(0, 16)}`,
    primitive: definition.primitive_id || definition.qualified_type,
    layout: options.mode || 'form',
    title: definition.name || definition.qualified_type,
    components: fields.map((field) => ({
      component: field.kind === 'enum' ? 'select-field' : field.kind === 'boolean' ? 'boolean-field' : 'data-field',
      bind: field.id,
      props: { label: field.name || field.id, required: !!field.required, values: field.values || undefined },
    })),
  };
}

export async function planUi({ definition, data, principal, language, planner, registry, visibleFields, grantedCapabilities }) {
  const fallback = createDeterministicUi(definition, { visibleFields });
  if (typeof planner !== 'function') return { manifest: fallback, generated: false, fallback_reason: 'planner unavailable' };
  const safeData = Object.fromEntries(Object.entries(data || {}).filter(([key]) => visibleFields.includes(key)));
  let candidate;
  try {
    candidate = await planner({
      instruction: 'Compose a UI manifest using only registered components, visible fields, and actions. Do not emit executable code.',
      primitive: {
        primitive_id: definition.primitive_id,
        qualified_type: definition.qualified_type,
        name: definition.name,
        fields: (definition.fields || []).filter((field) => visibleFields.includes(field.id)),
      },
      data: safeData,
      principal: { id: principal.id, kind: principal.kind },
      language,
      components: [...registry.components.keys()],
      actions: [...registry.actions.values()].filter((action) => grantedCapabilities.includes(action.capability)).map((action) => action.id),
    });
  } catch (error) {
    return { manifest: fallback, generated: false, fallback_reason: error.message };
  }
  const validation = validateUiManifest(candidate, { registry, visibleFields, grantedCapabilities });
  if (!validation.valid) return { manifest: fallback, generated: false, fallback_reason: 'generated manifest rejected', errors: validation.errors };
  return { manifest: candidate, generated: true };
}

export function actionToEnvelope(manifestComponent, registry, input = {}) {
  const action = registry.actions.get(manifestComponent.action);
  if (!action) throw new Error(`Unknown UI action '${manifestComponent.action}'.`);
  return typeof action.command === 'function' ? action.command(input) : structuredClone(action.command);
}
