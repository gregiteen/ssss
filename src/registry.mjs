/**
 * Registry-driven type resolution for the canonical SSSS engine.
 *
 * Harvested from festech's `SsssValidator` (which validates against a JSON
 * primitive registry rather than hardcoded schemas) and generalized to read the
 * canonical `registry/core.json` plus any `registry/extensions/*.json`. This is
 * the validation authority for §9: a type's `required_fields`, `append_only`
 * flag, and `portability` class (§5.5) all come from the registry, so the engine
 * has no per-type code.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REGISTRY_DIR = path.resolve(__dirname, '..', 'registry');

const APPEND_TYPES = new Set(['conversation', 'run']);
const SAFE_REGISTRY_NAME = /^[a-z][a-z0-9_-]{0,63}$/;
const SAFE_TYPE_NAME = /^[a-z][a-z0-9_-]{0,127}$/;
const SAFE_FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function assertRecord(value, label) {
  if (value === undefined) return;
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
}

function assertStringArray(value, label) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item)) {
    throw new Error(`${label} must be an array of non-empty strings.`);
  }
  if (new Set(value).size !== value.length) throw new Error(`${label} must not contain duplicates.`);
}

function validatePrimitiveDefinition(name, def, source, portabilityClasses) {
  if (!SAFE_TYPE_NAME.test(name)) throw new Error(`${source}: unsafe primitive name '${name}'.`);
  if (!def || typeof def !== 'object' || Array.isArray(def)) {
    throw new Error(`${source}: primitive '${name}' must be an object.`);
  }
  if (typeof def.append_only !== 'boolean') {
    throw new Error(`${source}: primitive '${name}' must declare append_only as a boolean.`);
  }
  if (!portabilityClasses.includes(def.portability)) {
    throw new Error(`${source}: primitive '${name}' has invalid portability '${def.portability}'.`);
  }
  assertStringArray(def.required_fields, `${source}: primitive '${name}' required_fields`);
  assertStringArray(def.optional_fields, `${source}: primitive '${name}' optional_fields`);
  assertStringArray(def.immutable_fields, `${source}: primitive '${name}' immutable_fields`);

  assertRecord(def.required_when, `${source}: primitive '${name}' required_when`);
  for (const [condition, fields] of Object.entries(def.required_when || {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_-]*==.+$/.test(condition)) {
      throw new Error(`${source}: primitive '${name}' has invalid required_when condition '${condition}'.`);
    }
    assertStringArray(fields, `${source}: primitive '${name}' required_when '${condition}'`);
  }
  assertRecord(def.patterns, `${source}: primitive '${name}' patterns`);
  for (const [field, pattern] of Object.entries(def.patterns || {})) {
    if (!SAFE_FIELD_NAME.test(field)) {
      throw new Error(`${source}: primitive '${name}' has unsafe pattern field '${field}'.`);
    }
    if (typeof pattern !== 'string') {
      throw new Error(`${source}: primitive '${name}' pattern for '${field}' must be a string.`);
    }
    try { new RegExp(pattern, 'u'); }
    catch (error) {
      throw new Error(`${source}: primitive '${name}' has invalid pattern for '${field}': ${error.message}`);
    }
  }
  assertRecord(def.enums, `${source}: primitive '${name}' enums`);
  for (const [field, values] of Object.entries(def.enums || {})) {
    if (!SAFE_FIELD_NAME.test(field)) {
      throw new Error(`${source}: primitive '${name}' has unsafe enum field '${field}'.`);
    }
    assertStringArray(values, `${source}: primitive '${name}' enum '${field}'`);
  }
  assertRecord(def.references, `${source}: primitive '${name}' references`);
  for (const [field, constraint] of Object.entries(def.references || {})) {
    if (!SAFE_FIELD_NAME.test(field)) {
      throw new Error(`${source}: primitive '${name}' has unsafe reference field '${field}'.`);
    }
    if (!constraint || typeof constraint !== 'object' || Array.isArray(constraint)) {
      throw new Error(`${source}: primitive '${name}' reference '${field}' must be an object.`);
    }
    assertStringArray(constraint.allowed_types, `${source}: primitive '${name}' reference '${field}' allowed_types`);
    assertStringArray(constraint.disallowed_types, `${source}: primitive '${name}' reference '${field}' disallowed_types`);
    assertStringArray(constraint.allowed_portability, `${source}: primitive '${name}' reference '${field}' allowed_portability`);
    if (constraint.allowed_portability?.some((value) => !portabilityClasses.includes(value))) {
      throw new Error(`${source}: primitive '${name}' reference '${field}' has an invalid allowed_portability value.`);
    }
    if (constraint.must_exist !== undefined && typeof constraint.must_exist !== 'boolean') {
      throw new Error(`${source}: primitive '${name}' reference '${field}' must_exist must be a boolean.`);
    }
    const overlap = (constraint.allowed_types || []).filter((value) =>
      constraint.disallowed_types?.includes(value));
    if (overlap.length) {
      throw new Error(`${source}: primitive '${name}' reference '${field}' both allows and forbids: ${overlap.join(', ')}.`);
    }
    if (constraint.hash_field !== undefined &&
        (typeof constraint.hash_field !== 'string' || !SAFE_FIELD_NAME.test(constraint.hash_field))) {
      throw new Error(`${source}: primitive '${name}' reference '${field}' hash_field must be a non-empty string.`);
    }
  }
}

/**
 * Load the core registry and merge extension registries.
 * @param {string} [registryDir] - directory containing core.json + extensions/
 * @returns {{ types: Map<string, object>, contractTypes: Set<string>, portabilityClasses: string[], core: object, extensions: Set<string> }}
 */
export function loadRegistries(registryDir = DEFAULT_REGISTRY_DIR) {
  const corePath = path.join(registryDir, 'core.json');
  const core = JSON.parse(fs.readFileSync(corePath, 'utf8'));
  const portabilityClasses = Object.keys(core.portability?.classes || {});
  if (!portabilityClasses.length) throw new Error('core.json: portability.classes must not be empty.');
  const extensions = new Set();

  const types = new Map();
  for (const [name, def] of Object.entries(core.document_primitives || {})) {
    validatePrimitiveDefinition(name, def, 'core.json', portabilityClasses);
    types.set(name, { ...def, type: name, registry: 'core' });
  }

  const extDir = path.join(registryDir, 'extensions');
  if (fs.existsSync(extDir)) {
    for (const file of fs.readdirSync(extDir).filter((f) => f.endsWith('.json')).sort()) {
      const extPath = path.join(extDir, file);
      if (fs.lstatSync(extPath).isSymbolicLink()) {
        throw new Error(`extensions/${file}: symlinked registries are not allowed.`);
      }
      const ext = JSON.parse(fs.readFileSync(extPath, 'utf8'));
      if (!SAFE_REGISTRY_NAME.test(ext.registry || '')) {
        throw new Error(`extensions/${file}: registry must be a safe identifier.`);
      }
      if (ext.registry === 'core' || extensions.has(ext.registry)) {
        throw new Error(`extensions/${file}: duplicate or reserved registry name '${ext.registry}'.`);
      }
      if (ext.extends !== undefined && ext.extends !== 'core') {
        throw new Error(`extensions/${file}: extends must be 'core'.`);
      }
      extensions.add(ext.registry);
      for (const [name, def] of Object.entries(ext.document_primitives || {})) {
        validatePrimitiveDefinition(name, def, `extensions/${file}`, portabilityClasses);
        if (types.has(name)) {
          throw new Error(
            `extensions/${file}: primitive '${name}' collides with registry '${types.get(name).registry}'.`
          );
        }
        types.set(name, { ...def, type: name, registry: ext.registry });
      }
    }
  }

  for (const def of types.values()) {
    for (const [field, constraint] of Object.entries(def.references || {})) {
      for (const target of [...(constraint.allowed_types || []), ...(constraint.disallowed_types || [])]) {
        if (!SAFE_TYPE_NAME.test(target) || !types.has(target)) {
          throw new Error(
            `registry '${def.registry}' primitive '${def.type}' reference '${field}' names unknown type '${target}'.`
          );
        }
      }
    }
  }

  const contractTypes = new Set(Object.keys(core.contract_primitives || {}));
  return { types, contractTypes, portabilityClasses, core, extensions };
}

/** Is this document type append-only (events appended, never rewritten)? */
export function isAppendType(typeDef) {
  if (!typeDef) return false;
  if (typeof typeDef.append_only === 'boolean') return typeDef.append_only;
  return APPEND_TYPES.has(typeDef.type);
}

/**
 * Resolve the effective portability class of a file: the most restrictive of
 * the type default and an `x_portability` instance override (§5.5).
 */
export function resolvePortability(typeDef, frontmatter) {
  const order = { structural: 0, resource_bound: 1, tenant_private: 2 };
  const base = typeDef?.portability || 'structural';
  const override = frontmatter?.x_portability;
  if (override && order[override] != null && order[override] > (order[base] ?? 0)) return override;
  return base;
}

/** Is a registry-declared document reference a safe vault-relative path? */
export function isSafeDocumentPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\0') || value.includes('\\')) return false;
  if (value.startsWith('/') || path.isAbsolute(value)) return false;
  const parts = value.split('/');
  return !parts.some((part) => !part || part === '.' || part === '..');
}

/** Stable hash used to bind derived/translated documents to an exact source. */
export function documentHash(content) {
  return `sha256:${crypto.createHash('sha256').update(String(content)).digest('hex')}`;
}

function isEmpty(value) {
  return value === undefined || value === null || value === '' ||
    (Array.isArray(value) && value.length === 0);
}

/**
 * Validate the registry's field-level schema independently of any storage
 * operation. Used by the engine, bundle transport, and semantic projections.
 */
export function validateDataConstraints(typeDef, data, universalRequired = []) {
  const issues = [];
  const required = new Set([...universalRequired, ...(typeDef?.required_fields || [])]);
  for (const field of required) {
    if (isEmpty(data[field])) issues.push({ field, issue: `Missing required field '${field}'.` });
  }
  for (const [condition, fields] of Object.entries(typeDef?.required_when || {})) {
    const match = condition.match(/^([A-Za-z_][A-Za-z0-9_-]*)==(.+)$/);
    if (!match) continue;
    const expected = /^-?\d+$/.test(match[2]) ? Number(match[2]) : match[2];
    if (data[match[1]] !== expected) continue;
    for (const field of fields) {
      if (isEmpty(data[field])) issues.push({ field, issue: `Required when ${condition}.` });
    }
  }
  for (const [field, allowed] of Object.entries(typeDef?.enums || {})) {
    if (isEmpty(data[field])) continue;
    const values = Array.isArray(data[field]) ? data[field] : [data[field]];
    for (const value of values) {
      if (!allowed.includes(value)) {
        issues.push({ field, issue: `Invalid value '${value}'; must be one of: ${allowed.join(', ')}.` });
      }
    }
  }
  for (const [field, source] of Object.entries(typeDef?.patterns || {})) {
    if (isEmpty(data[field])) continue;
    const expression = new RegExp(source, 'u');
    const values = Array.isArray(data[field]) ? data[field] : [data[field]];
    for (const value of values) {
      if (typeof value !== 'string' || !expression.test(value)) {
        issues.push({ field, issue: `Value must match registry pattern '${source}'.` });
      }
    }
  }
  return issues;
}

/**
 * Validate registry-declared document references using a caller-provided
 * resolver. This keeps path, type, portability, and hash checks shared by the
 * Operation Contract, bundles, and semantic/localization projections.
 */
export function validateReferenceConstraints(typeDef, data, resolveReference, types) {
  const issues = [];
  for (const [field, constraint] of Object.entries(typeDef?.references || {})) {
    const referencePath = data[field];
    if (referencePath === undefined || referencePath === null || referencePath === '') continue;
    if (!isSafeDocumentPath(referencePath)) {
      issues.push({ field, issue: `Reference path '${referencePath}' is not a safe vault-relative path.` });
      continue;
    }
    let referenced = null;
    try { referenced = resolveReference(referencePath); }
    catch (error) {
      issues.push({ field, issue: `Reference '${referencePath}' could not be resolved: ${error.message}` });
      continue;
    }
    if (!referenced) {
      if (constraint.must_exist !== false) {
        issues.push({ field, issue: `Referenced document '${referencePath}' does not exist.` });
      }
      continue;
    }
    const referencedType = referenced.data?.type;
    if (!types.has(referencedType)) {
      issues.push({ field, issue: `Referenced document declares unknown type '${referencedType || '(missing)'}'.` });
      continue;
    }
    if (constraint.allowed_types && !constraint.allowed_types.includes(referencedType)) {
      issues.push({ field, issue: `Referenced type '${referencedType}' is not allowed.` });
    }
    if (constraint.disallowed_types?.includes(referencedType)) {
      issues.push({ field, issue: `Referenced type '${referencedType}' is forbidden.` });
    }
    const referencedPortability = resolvePortability(types.get(referencedType), referenced.data);
    if (constraint.allowed_portability && !constraint.allowed_portability.includes(referencedPortability)) {
      issues.push({
        field,
        issue: `Referenced document is '${referencedPortability}'; allowed portability: ${constraint.allowed_portability.join(', ')}.`,
      });
    }
    if (constraint.hash_field) {
      const expected = documentHash(referenced.content);
      if (data[constraint.hash_field] !== expected) {
        issues.push({
          field: constraint.hash_field,
          issue: `Source hash mismatch for '${referencePath}'; expected '${expected}'.`,
        });
      }
    }
  }
  return issues;
}
