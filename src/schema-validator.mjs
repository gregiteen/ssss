/**
 * Zero-dependency JSON Schema validator for SSSS core and bundle schemas.
 *
 * Implements validation for standard JSON Schema Draft 2020-12 constructs
 * used by SSSS schemas:
 *   - type (single or union)
 *   - properties & additionalProperties
 *   - required
 *   - items
 *   - enum
 *   - pattern
 *   - $ref (local root-anchored pointers: #/$defs/...)
 */

function resolveRef(root, ref) {
  if (!ref.startsWith('#/')) {
    throw new Error(`Only local root-anchored $ref pointers are supported: ${ref}`);
  }
  const parts = ref.slice(2).split('/');
  let current = root;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      throw new Error(`Unable to resolve $ref pointer: ${ref}`);
    }
    current = current[part];
  }
  return current;
}

function matchType(value, expectedType) {
  if (Array.isArray(expectedType)) {
    return expectedType.some((t) => matchType(value, t));
  }
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !Number.isNaN(value);
    case 'integer':
      return Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'null':
      return value === null;
    default:
      return true;
  }
}

export function validateJsonSchema(data, schema, options = {}) {
  const root = options.rootSchema || schema;
  const errors = [];

  function validate(value, curSchema, path) {
    if (!curSchema || typeof curSchema !== 'object') return;

    if (curSchema.$ref) {
      const resolved = resolveRef(root, curSchema.$ref);
      validate(value, resolved, path);
      return;
    }

    if (curSchema.type !== undefined) {
      if (!matchType(value, curSchema.type)) {
        errors.push({
          path,
          message: `Expected type ${JSON.stringify(curSchema.type)}, but received ${Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value}.`,
        });
        return;
      }
    }

    if (curSchema.enum !== undefined && !curSchema.enum.includes(value)) {
      errors.push({
        path,
        message: `Value ${JSON.stringify(value)} is not in enum: ${curSchema.enum.map((e) => JSON.stringify(e)).join(', ')}.`,
      });
    }

    if (typeof value === 'string' && curSchema.pattern !== undefined) {
      const reg = new RegExp(curSchema.pattern);
      if (!reg.test(value)) {
        errors.push({
          path,
          message: `String does not match pattern ${curSchema.pattern}.`,
        });
      }
    }

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      if (Array.isArray(curSchema.required)) {
        for (const reqKey of curSchema.required) {
          if (value[reqKey] === undefined) {
            errors.push({
              path: path ? `${path}.${reqKey}` : reqKey,
              message: `Missing required property '${reqKey}'.`,
            });
          }
        }
      }

      const definedKeys = new Set(Object.keys(curSchema.properties || {}));
      for (const [key, val] of Object.entries(value)) {
        const subPath = path ? `${path}.${key}` : key;
        if (definedKeys.has(key)) {
          validate(val, curSchema.properties[key], subPath);
        } else if (curSchema.additionalProperties === false) {
          errors.push({
            path: subPath,
            message: `Unexpected property '${key}' not defined in schema.`,
          });
        } else if (typeof curSchema.additionalProperties === 'object' && curSchema.additionalProperties !== null) {
          validate(val, curSchema.additionalProperties, subPath);
        }
      }
    }

    if (Array.isArray(value) && curSchema.items) {
      for (let i = 0; i < value.length; i++) {
        validate(value[i], curSchema.items, `${path}[${i}]`);
      }
    }
  }

  validate(data, schema, '');
  return {
    valid: errors.length === 0,
    errors,
  };
}
