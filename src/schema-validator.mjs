/**
 * Zero-dependency JSON Schema Draft 2020-12 validator for SSSS core, extension,
 * and bundle schemas.
 *
 * Implements validation for JSON Schema Draft 2020-12 constructs used across SSSS:
 *   - type (single or union)
 *   - const & enum
 *   - properties, additionalProperties & propertyNames
 *   - required
 *   - items, minItems, maxItems & uniqueItems
 *   - minLength, maxLength & pattern (Unicode-aware)
 *   - minimum & maximum
 *   - allOf, anyOf & oneOf
 *   - if / then / else
 *   - $ref (local root-anchored pointers `#/...` evaluated alongside sibling keywords)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMAS_DIR = path.resolve(__dirname, '..', 'schemas');

let cachedCoreSchema = null;
let cachedBundleSchema = null;

function resolveRef(root, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) {
    throw new Error(`Only local root-anchored $ref pointers are supported: ${ref}`);
  }
  const parts = ref.slice(2).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current = root;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      throw new Error(`Unable to resolve $ref pointer: ${ref}`);
    }
    current = current[part];
  }
  if (current === undefined) {
    throw new Error(`Unable to resolve $ref pointer: ${ref}`);
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

function itemKey(item) {
  if (item === null) return 'null:null';
  if (typeof item === 'object') return `json:${JSON.stringify(item)}`;
  return `${typeof item}:${String(item)}`;
}

export function validateJsonSchema(data, schema, options = {}) {
  const root = options.rootSchema || schema;
  const errors = [];

  function validate(value, curSchema, curPath, seenRefs = new Set()) {
    if (!curSchema || typeof curSchema !== 'object') return;

    if (curSchema.$ref) {
      if (!seenRefs.has(curSchema.$ref)) {
        const nextSeen = new Set(seenRefs);
        nextSeen.add(curSchema.$ref);
        const resolved = resolveRef(root, curSchema.$ref);
        validate(value, resolved, curPath, nextSeen);
      }
    }

    if (Array.isArray(curSchema.allOf)) {
      for (const subSchema of curSchema.allOf) {
        validate(value, subSchema, curPath, seenRefs);
      }
    }

    if (Array.isArray(curSchema.anyOf)) {
      const matched = curSchema.anyOf.some(
        (subSchema) => validateJsonSchema(value, subSchema, { rootSchema: root }).valid
      );
      if (!matched) {
        errors.push({
          path: curPath,
          message: 'Value does not match any allowed schema in anyOf.',
        });
      }
    }

    if (Array.isArray(curSchema.oneOf)) {
      const matchCount = curSchema.oneOf.filter(
        (subSchema) => validateJsonSchema(value, subSchema, { rootSchema: root }).valid
      ).length;
      if (matchCount !== 1) {
        errors.push({
          path: curPath,
          message: `Expected value to match exactly one schema in oneOf, matched ${matchCount}.`,
        });
      }
    }

    if (curSchema.if !== undefined && (curSchema.then !== undefined || curSchema.else !== undefined)) {
      const branch = validateJsonSchema(value, curSchema.if, { rootSchema: root }).valid
        ? curSchema.then
        : curSchema.else;
      if (branch !== undefined) validate(value, branch, curPath, seenRefs);
    }

    if (curSchema.const !== undefined) {
      if (JSON.stringify(value) !== JSON.stringify(curSchema.const)) {
        errors.push({
          path: curPath,
          message: `Expected constant ${JSON.stringify(curSchema.const)}, but received ${JSON.stringify(value)}.`,
        });
      }
    }

    if (curSchema.type !== undefined) {
      if (!matchType(value, curSchema.type)) {
        errors.push({
          path: curPath,
          message: `Expected type ${JSON.stringify(curSchema.type)}, but received ${Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value}.`,
        });
        return;
      }
    }

    if (curSchema.enum !== undefined && !curSchema.enum.includes(value)) {
      errors.push({
        path: curPath,
        message: `Value ${JSON.stringify(value)} is not in enum: ${curSchema.enum.map((e) => JSON.stringify(e)).join(', ')}.`,
      });
    }

    if (typeof value === 'string') {
      if (curSchema.minLength !== undefined && value.length < curSchema.minLength) {
        errors.push({
          path: curPath,
          message: `String length ${value.length} is less than minLength ${curSchema.minLength}.`,
        });
      }
      if (curSchema.maxLength !== undefined && value.length > curSchema.maxLength) {
        errors.push({
          path: curPath,
          message: `String length ${value.length} exceeds maxLength ${curSchema.maxLength}.`,
        });
      }
      if (curSchema.pattern !== undefined) {
        let reg;
        try {
          reg = new RegExp(curSchema.pattern, 'u');
        } catch (err) {
          errors.push({
            path: curPath,
            message: `Invalid schema regular expression ${curSchema.pattern}: ${err.message}`,
          });
        }
        if (reg && !reg.test(value)) {
          errors.push({
            path: curPath,
            message: `String does not match pattern ${curSchema.pattern}.`,
          });
        }
      }
    }

    if (typeof value === 'number' && !Number.isNaN(value)) {
      if (curSchema.minimum !== undefined && value < curSchema.minimum) {
        errors.push({
          path: curPath,
          message: `Value ${value} is less than minimum ${curSchema.minimum}.`,
        });
      }
      if (curSchema.maximum !== undefined && value > curSchema.maximum) {
        errors.push({
          path: curPath,
          message: `Value ${value} exceeds maximum ${curSchema.maximum}.`,
        });
      }
    }

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      if (Array.isArray(curSchema.required)) {
        for (const reqKey of curSchema.required) {
          if (value[reqKey] === undefined) {
            errors.push({
              path: curPath ? `${curPath}.${reqKey}` : reqKey,
              message: `Missing required property '${reqKey}'.`,
            });
          }
        }
      }

      if (curSchema.propertyNames && typeof curSchema.propertyNames === 'object') {
        for (const key of Object.keys(value)) {
          const keyPath = curPath ? `${curPath}.${key}` : key;
          const keyCheck = validateJsonSchema(key, curSchema.propertyNames, { rootSchema: root });
          if (!keyCheck.valid) {
            for (const err of keyCheck.errors) {
              errors.push({
                path: keyPath,
                message: `Invalid property name '${key}': ${err.message}`,
              });
            }
          }
        }
      }

      if (curSchema.properties !== undefined || curSchema.additionalProperties !== undefined) {
        const definedKeys = new Set(Object.keys(curSchema.properties || {}));
        for (const [key, val] of Object.entries(value)) {
          const subPath = curPath ? `${curPath}.${key}` : key;
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
    }

    if (Array.isArray(value)) {
      if (curSchema.minItems !== undefined && value.length < curSchema.minItems) {
        errors.push({
          path: curPath,
          message: `Array length ${value.length} is less than minItems ${curSchema.minItems}.`,
        });
      }
      if (curSchema.maxItems !== undefined && value.length > curSchema.maxItems) {
        errors.push({
          path: curPath,
          message: `Array length ${value.length} exceeds maxItems ${curSchema.maxItems}.`,
        });
      }
      if (curSchema.uniqueItems === true) {
        const seen = new Set();
        for (let i = 0; i < value.length; i++) {
          const k = itemKey(value[i]);
          if (seen.has(k)) {
            errors.push({
              path: `${curPath}[${i}]`,
              message: `Duplicate array item ${JSON.stringify(value[i])} violates uniqueItems.`,
            });
          }
          seen.add(k);
        }
      }
      if (curSchema.items) {
        for (let i = 0; i < value.length; i++) {
          validate(value[i], curSchema.items, `${curPath}[${i}]`);
        }
      }
    }
  }

  validate(data, schema, '');
  return {
    valid: errors.length === 0,
    errors,
  };
}

/** Return the parsed canonical Core Registry JSON Schema (`schemas/core-registry.schema.json`). */
export function getCoreRegistrySchema() {
  if (!cachedCoreSchema) {
    cachedCoreSchema = JSON.parse(
      fs.readFileSync(path.join(SCHEMAS_DIR, 'core-registry.schema.json'), 'utf8')
    );
  }
  return cachedCoreSchema;
}

/** Return the parsed canonical Bundle JSON Schema (`schemas/bundle.schema.json`). */
export function getBundleSchema() {
  if (!cachedBundleSchema) {
    cachedBundleSchema = JSON.parse(
      fs.readFileSync(path.join(SCHEMAS_DIR, 'bundle.schema.json'), 'utf8')
    );
  }
  return cachedBundleSchema;
}

/** Validate a core or extension registry object against `schemas/core-registry.schema.json`. */
export function validateRegistryAgainstSchema(registry) {
  return validateJsonSchema(registry, getCoreRegistrySchema());
}

/** Validate a `.ucw` bundle object against `schemas/bundle.schema.json`. */
export function validateBundleAgainstSchema(bundle) {
  return validateJsonSchema(bundle, getBundleSchema());
}
