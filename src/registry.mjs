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
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REGISTRY_DIR = path.resolve(__dirname, '..', 'registry');

const APPEND_TYPES = new Set(['conversation', 'run']);

/**
 * Load the core registry and merge extension registries.
 * @param {string} [registryDir] - directory containing core.json + extensions/
 * @returns {{ types: Map<string, object>, contractTypes: Set<string>, portabilityClasses: string[], core: object }}
 */
export function loadRegistries(registryDir = DEFAULT_REGISTRY_DIR) {
  const corePath = path.join(registryDir, 'core.json');
  const core = JSON.parse(fs.readFileSync(corePath, 'utf8'));

  const types = new Map();
  for (const [name, def] of Object.entries(core.document_primitives || {})) {
    types.set(name, { ...def, type: name, registry: 'core' });
  }

  const extDir = path.join(registryDir, 'extensions');
  if (fs.existsSync(extDir)) {
    for (const file of fs.readdirSync(extDir).filter((f) => f.endsWith('.json'))) {
      const ext = JSON.parse(fs.readFileSync(path.join(extDir, file), 'utf8'));
      for (const [name, def] of Object.entries(ext.document_primitives || {})) {
        if (types.has(name) && types.get(name).registry === 'core') continue; // core wins; extensions MUST NOT redefine
        types.set(name, { ...def, type: name, registry: ext.registry || file });
      }
    }
  }

  const contractTypes = new Set(Object.keys(core.contract_primitives || {}));
  const portabilityClasses = Object.keys(core.portability?.classes || {});
  return { types, contractTypes, portabilityClasses, core };
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
