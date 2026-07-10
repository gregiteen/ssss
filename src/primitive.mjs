/**
 * SSSS primitive-definition API (spec 0.9).
 *
 * Human-facing names and descriptions may be authored in any language. Stable
 * primitive/field/action/capability identifiers are symbolic controls and are
 * generated or validated here rather than translated by presentation layers.
 */
import crypto from 'node:crypto';
import { isPrimitiveTypeName } from './registry.mjs';

export const PRIMITIVE_MUTATIONS = ['replace', 'append'];
export const PRIMITIVE_PORTABILITY = ['structural', 'tenant_private', 'resource_bound'];
export const PRIMITIVE_SCOPES = ['system', 'account', 'workspace', 'user'];
export const FIELD_KINDS = [
  'string', 'text', 'number', 'integer', 'boolean', 'datetime', 'date',
  'enum', 'object', 'array', 'reference', 'secret_reference', 'resource_reference',
];

const NAMESPACE_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const SYMBOL_RE = /^[a-z][a-z0-9_-]{0,127}$/;
const LANGUAGE_RE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const CAPABILITY_RE = /^[a-z][a-z0-9_.-]{0,63}:[a-z][a-z0-9_.-]{0,127}$/;

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function issue(field, message) {
  return { field, issue: message };
}

function uniqueStrings(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item) &&
    new Set(value).size === value.length;
}

/** Generate a stable opaque local ID from an authored name in any language. */
export function generatePrimitiveId({ namespace, name, salt = '' }) {
  if (!NAMESPACE_RE.test(namespace || '')) throw new Error('namespace must be a safe lowercase identifier.');
  if (typeof name !== 'string' || !name.trim()) throw new Error('name must be non-empty.');
  const digest = crypto.createHash('sha256')
    .update(`${namespace}\0${name.normalize('NFKC')}\0${salt}`)
    .digest('hex')
    .slice(0, 20);
  return `${namespace}:p_${digest}`;
}

export function validatePrimitiveDefinition(definition) {
  const errors = [];
  if (!isRecord(definition)) return { valid: false, errors: [issue('(root)', 'Primitive definition must be an object.')] };
  const required = ['primitive_id', 'namespace', 'version', 'name', 'mutation', 'portability', 'scopes', 'fields'];
  for (const field of required) {
    const value = definition[field];
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) {
      errors.push(issue(field, `Missing required field '${field}'.`));
    }
  }
  if (!NAMESPACE_RE.test(definition.namespace || '')) {
    errors.push(issue('namespace', 'Use a lowercase namespace containing letters, numbers, underscore, or hyphen.'));
  }
  if (!isPrimitiveTypeName(definition.primitive_id) ||
      !definition.primitive_id?.startsWith(`${definition.namespace}:`)) {
    errors.push(issue('primitive_id', 'Use a qualified identifier whose prefix matches namespace.'));
  }
  if (!Number.isInteger(definition.version) || definition.version < 1) {
    errors.push(issue('version', 'Version must be a positive integer.'));
  }
  if (definition.revision !== undefined && (!Number.isInteger(definition.revision) || definition.revision < 1)) {
    errors.push(issue('revision', 'Revision must be a positive integer.'));
  }
  if (typeof definition.name !== 'string' || !definition.name.trim()) {
    errors.push(issue('name', 'Name may use any language but must not be empty.'));
  }
  if (definition.language !== undefined && !LANGUAGE_RE.test(definition.language)) {
    errors.push(issue('language', 'Use a BCP-47-style language tag.'));
  }
  if (!PRIMITIVE_MUTATIONS.includes(definition.mutation)) {
    errors.push(issue('mutation', `Use one of: ${PRIMITIVE_MUTATIONS.join(', ')}.`));
  }
  if (!PRIMITIVE_PORTABILITY.includes(definition.portability)) {
    errors.push(issue('portability', `Use one of: ${PRIMITIVE_PORTABILITY.join(', ')}.`));
  }
  if (!uniqueStrings(definition.scopes) ||
      definition.scopes.some((scope) => !PRIMITIVE_SCOPES.includes(scope))) {
    errors.push(issue('scopes', `Provide a unique non-empty subset of: ${PRIMITIVE_SCOPES.join(', ')}.`));
  }
  if (!Array.isArray(definition.fields)) {
    errors.push(issue('fields', 'Fields must be an array.'));
  } else {
    const ids = new Set();
    for (const [index, field] of definition.fields.entries()) {
      const prefix = `fields[${index}]`;
      if (!isRecord(field)) {
        errors.push(issue(prefix, 'Field definition must be an object.'));
        continue;
      }
      if (!SYMBOL_RE.test(field.id || '')) errors.push(issue(`${prefix}.id`, 'Use a stable lowercase symbolic field ID.'));
      else if (ids.has(field.id)) errors.push(issue(`${prefix}.id`, `Duplicate field ID '${field.id}'.`));
      else ids.add(field.id);
      if (typeof field.name !== 'string' || !field.name.trim()) {
        errors.push(issue(`${prefix}.name`, 'Field name may use any language but must not be empty.'));
      }
      if (!FIELD_KINDS.includes(field.kind)) {
        errors.push(issue(`${prefix}.kind`, `Use one of: ${FIELD_KINDS.join(', ')}.`));
      }
      if (field.kind === 'enum' && !uniqueStrings(field.values)) {
        errors.push(issue(`${prefix}.values`, 'Enum fields require unique non-empty symbolic values.'));
      }
      if (field.pattern !== undefined) {
        try { new RegExp(field.pattern, 'u'); }
        catch (error) { errors.push(issue(`${prefix}.pattern`, `Invalid regular expression: ${error.message}`)); }
      }
    }
  }
  if (definition.capabilities !== undefined) {
    if (!isRecord(definition.capabilities)) errors.push(issue('capabilities', 'Capabilities must be an action-to-list object.'));
    else for (const [action, values] of Object.entries(definition.capabilities)) {
      if (!SYMBOL_RE.test(action) || !uniqueStrings(values) || values.some((value) => !CAPABILITY_RE.test(value))) {
        errors.push(issue(`capabilities.${action}`, 'Use unique qualified capability IDs.'));
      }
    }
  }
  if (definition.projections !== undefined && !Array.isArray(definition.projections)) {
    errors.push(issue('projections', 'Projections must be an array.'));
  }
  if (definition.aliases !== undefined && (!uniqueStrings(definition.aliases) ||
      definition.aliases.some((alias) => !isPrimitiveTypeName(alias)))) {
    errors.push(issue('aliases', 'Aliases must be unique safe primitive identifiers.'));
  }
  if (definition.migrations !== undefined && !Array.isArray(definition.migrations)) {
    errors.push(issue('migrations', 'Migrations must be an array.'));
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Normalize a user/repo-authored definition and generate missing symbolic IDs.
 */
export function definePrimitive(input, options = {}) {
  if (!isRecord(input)) throw new Error('Primitive input must be an object.');
  const namespace = input.namespace || options.namespace;
  const primitive_id = input.primitive_id || generatePrimitiveId({ namespace, name: input.name, salt: options.salt });
  const fields = (input.fields || []).map((field, index) => ({
    ...field,
    id: field.id || `field_${crypto.createHash('sha256')
      .update(`${primitive_id}\0${field.name || index}`)
      .digest('hex').slice(0, 12)}`,
  }));
  const definition = {
    type: 'ssss:primitive',
    version: 1,
    revision: 1,
    mutation: 'replace',
    portability: 'structural',
    scopes: ['workspace'],
    ...input,
    namespace,
    primitive_id,
    fields,
  };
  const result = validatePrimitiveDefinition(definition);
  if (!result.valid) {
    const error = new Error(result.errors.map((entry) => `${entry.field}: ${entry.issue}`).join('; '));
    error.field_errors = result.errors;
    throw error;
  }
  return definition;
}

/** Convert a rich primitive definition into the executable registry schema. */
export function primitiveDefinitionToRegistryEntry(definition) {
  const result = validatePrimitiveDefinition(definition);
  if (!result.valid) throw new Error(result.errors.map((entry) => `${entry.field}: ${entry.issue}`).join('; '));
  const required_fields = ['type'];
  const optional_fields = [];
  const enums = {};
  const patterns = {};
  const references = {};
  for (const field of definition.fields) {
    (field.required ? required_fields : optional_fields).push(field.id);
    if (field.kind === 'enum') enums[field.id] = field.values;
    if (field.pattern) patterns[field.id] = field.pattern;
    if (field.kind === 'reference') references[field.id] = {
      must_exist: field.must_exist !== false,
      ...(field.allowed_types ? { allowed_types: field.allowed_types } : {}),
      ...(field.allowed_portability ? { allowed_portability: field.allowed_portability } : {}),
    };
  }
  return {
    family: definition.family || 'extension',
    canonical_path: definition.path_template || null,
    append_only: definition.mutation === 'append',
    portability: definition.portability,
    required_fields,
    optional_fields,
    ...(Object.keys(enums).length ? { enums } : {}),
    ...(Object.keys(patterns).length ? { patterns } : {}),
    ...(Object.keys(references).length ? { references } : {}),
    scopes: definition.scopes,
    capabilities: definition.capabilities || {},
    events: definition.events || [],
    projections: definition.projections || [],
    ui: definition.ui || {},
    aliases: definition.aliases || [],
    migrations: definition.migrations || [],
    primitive_version: definition.version,
    primitive_revision: definition.revision || 1,
    authored_language: definition.language || null,
  };
}

/** Package one or more definitions as an extension registry object. */
export function definitionsToExtensionRegistry(namespace, definitions, options = {}) {
  if (!NAMESPACE_RE.test(namespace || '')) throw new Error('Invalid namespace.');
  const document_primitives = {};
  for (const definition of definitions) {
    if (definition.namespace !== namespace) throw new Error(`Definition '${definition.primitive_id}' belongs to another namespace.`);
    document_primitives[definition.primitive_id] = primitiveDefinitionToRegistryEntry(definition);
  }
  return {
    registry: namespace,
    extends: 'ssss',
    version: options.version || '1.0.0',
    requires: options.requires || {},
    document_primitives,
  };
}
