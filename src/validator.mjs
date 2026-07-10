/** Canonical registry-driven validation shared by every SSSS host. */
import { parseDocument } from './frontmatter.mjs';
import {
  composeRegistries,
  loadRegistries,
  resolvePrimitiveDefinition,
  validateDataConstraints,
  validateReferenceConstraints,
} from './registry.mjs';
import { validatePrimitiveDefinition } from './primitive.mjs';

function registryFor(options = {}) {
  if (options.registrySet) return options.registrySet;
  const base = loadRegistries(options.registryDir);
  if (!options.extensions?.length) return base;
  return composeRegistries({ core: base.core, extensions: options.extensions });
}

function result(declaredType, definition, issues, warnings = []) {
  return {
    valid: issues.length === 0,
    type: definition?.qualified_type || declaredType || 'unknown',
    declared_type: declaredType || null,
    registry: definition?.registry || null,
    primitive_version: definition?.primitive_version || 1,
    errors: issues.map((entry) => `${entry.field}: ${entry.issue}`),
    warnings,
    field_errors: issues,
  };
}

export function validateData(data, options = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return result(null, null, [{ field: 'frontmatter', issue: 'Document frontmatter must be an object.' }]);
  }
  const declaredType = typeof data.type === 'string' ? data.type : null;
  if (!declaredType) return result(null, null, [{ field: 'type', issue: "Missing required field 'type'." }]);
  const registrySet = registryFor(options);
  const definition = resolvePrimitiveDefinition(registrySet, declaredType);
  if (!definition) return result(declaredType, null, [{ field: 'type', issue: `Unknown SSSS primitive '${declaredType}'.` }]);
  const universal = options.enforceUniversalFields === false
    ? ['type']
    : (registrySet.core.universal_frontmatter?.required || ['type']);
  const issues = validateDataConstraints(definition, data, universal);

  if (definition.qualified_type === 'ssss:primitive' || definition.type === 'primitive') {
    issues.push(...validatePrimitiveDefinition(data).errors);
  }

  if (definition.references && options.resolveReference) {
    issues.push(...validateReferenceConstraints(
      definition,
      data,
      options.resolveReference,
      registrySet.types
    ));
  }
  if (options.validateExtension) {
    const extra = options.validateExtension({ data, definition, registrySet }) || [];
    issues.push(...extra);
  }
  return result(declaredType, definition, issues);
}

export function validateDocument(content, options = {}) {
  if (typeof content !== 'string') {
    return result(null, null, [{ field: 'content', issue: 'Document content must be a string.' }]);
  }
  try {
    const parsed = parseDocument(content);
    const validation = validateData(parsed.data, options);
    return { ...validation, data: parsed.data, body: parsed.body };
  } catch (error) {
    return result(null, null, [{ field: 'frontmatter', issue: `Invalid frontmatter: ${error.message}` }]);
  }
}

export function createValidator(options = {}) {
  const registrySet = registryFor(options);
  const fixed = { ...options, registrySet, extensions: undefined, registryDir: undefined };
  return {
    registry: registrySet,
    validateData: (data, callOptions = {}) => validateData(data, { ...fixed, ...callOptions, registrySet }),
    validateDocument: (content, callOptions = {}) => validateDocument(content, { ...fixed, ...callOptions, registrySet }),
    resolve: (type) => resolvePrimitiveDefinition(registrySet, type),
  };
}
