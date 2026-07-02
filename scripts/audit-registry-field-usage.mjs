#!/usr/bin/env node
/**
 * Registry-parity audit: proves every registry field the reference engine is
 * supposed to enforce at write time is actually referenced in src/engine.mjs.
 *
 * Motivation: registry/core.json declared `required_when` and `enums` on the
 * `memory` primitive for a full release cycle before src/engine.mjs's
 * validateContent() ever read either one — a memory node could omit a
 * conditionally-required field or use an out-of-enum value and still pass
 * conformance. That gap was invisible to normal testing because nothing
 * cross-checked "declared in the registry" against "consumed by the engine."
 *
 * This is deliberately a STATIC, deterministic check (grep the engine source
 * for a reference to each enforcement-relevant key), not an LLM judgment
 * call — the whole point is that this class of drift should never again
 * require a human or an agent to notice it. Wired into every
 * `ssss conformance` run (see scripts/conformance.mjs), not just an
 * agent-invoked skill, so it can't silently regress by nobody remembering to
 * ask.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_DIR = path.resolve(__dirname, '..', 'registry');
// "The engine" for this audit's purposes is the write-time enforcement path:
// src/engine.mjs itself plus src/registry.mjs, which engine.mjs delegates
// type-resolution helpers to (e.g. `append_only` is actually read inside
// registry.mjs's isAppendType(), not inlined in engine.mjs).
const ENGINE_FILES = [
  path.resolve(__dirname, '..', 'src', 'engine.mjs'),
  path.resolve(__dirname, '..', 'src', 'registry.mjs'),
];

// Keys the reference engine is expected to enforce at write time (Stage 5,
// spec §6.3 + §9). If a primitive declares one, the engine source MUST
// reference it — otherwise the registry is making a promise the engine
// doesn't keep.
const ENGINE_ENFORCED_KEYS = ['required_fields', 'required_when', 'enums', 'append_only'];

// Keys that are real and load-bearing but are intentionally consumed
// elsewhere (export/bundle time, documentation, or the registry loader
// itself), not by src/engine.mjs's write-time content validation. Extend
// this list — with a comment saying WHERE the key is actually consumed —
// rather than silencing a warning by deleting it.
const KNOWN_NON_ENGINE_KEYS = new Set([
  'family', 'canonical_filename', 'canonical_path', 'filename_convention', 'notes', 'spec_ref',
  'optional_fields', 'type', 'registry',
  'portability', // consumed by src/registry.mjs resolvePortability() + src/bundle.mjs export filtering, not write-time validation
  'resource', // extension-defined resource_bound metadata, consumed by src/bundle.mjs provisioning
]);

function loadAllPrimitiveDefs() {
  const defs = [];
  const corePath = path.join(REGISTRY_DIR, 'core.json');
  const core = JSON.parse(fs.readFileSync(corePath, 'utf8'));
  for (const [name, def] of Object.entries(core.document_primitives || {})) {
    defs.push({ name, def, source: 'core.json' });
  }
  const extDir = path.join(REGISTRY_DIR, 'extensions');
  if (fs.existsSync(extDir)) {
    for (const file of fs.readdirSync(extDir).filter((f) => f.endsWith('.json'))) {
      const ext = JSON.parse(fs.readFileSync(path.join(extDir, file), 'utf8'));
      for (const [name, def] of Object.entries(ext.document_primitives || {})) {
        defs.push({ name, def, source: `extensions/${file}` });
      }
    }
  }
  return defs;
}

/** Does any engine-path source file reference `def.<key>` (or an equivalent literal access)? */
function engineReferencesKey(engineSources, key) {
  const patterns = [
    new RegExp(`\\bdef\\.${key}\\b`),
    new RegExp(`\\btypeDef\\.${key}\\b`),
    new RegExp(`\\['${key}'\\]`),
    new RegExp(`\\["${key}"\\]`),
  ];
  return engineSources.some((src) => patterns.some((re) => re.test(src)));
}

/**
 * Returns an array of problem strings. Empty array = clean.
 */
export function auditRegistryFieldUsage() {
  const problems = [];
  const missing = ENGINE_FILES.filter((f) => !fs.existsSync(f));
  if (missing.length) return missing.map((f) => `engine source not found at ${f}`);
  const engineSources = ENGINE_FILES.map((f) => fs.readFileSync(f, 'utf8'));

  const defs = loadAllPrimitiveDefs();
  const keysSeen = new Set();
  for (const { name, def, source } of defs) {
    for (const key of Object.keys(def)) keysSeen.add(key);

    for (const key of ENGINE_ENFORCED_KEYS) {
      if (def[key] === undefined) continue;
      if (!engineReferencesKey(engineSources, key)) {
        problems.push(
          `${source}: primitive "${name}" declares "${key}" but src/engine.mjs never references it — ` +
          `the registry is promising enforcement the engine doesn't perform.`
        );
      }
    }
  }

  // Flag any key the engine-enforced list and the known-elsewhere list both
  // fail to account for — a new field was added and nobody classified it yet.
  for (const key of keysSeen) {
    if (ENGINE_ENFORCED_KEYS.includes(key) || KNOWN_NON_ENGINE_KEYS.has(key)) continue;
    problems.push(
      `unclassified registry key "${key}" — add it to ENGINE_ENFORCED_KEYS (if src/engine.mjs should ` +
      `enforce it at write time) or KNOWN_NON_ENGINE_KEYS (with a comment on where it IS consumed) ` +
      `in scripts/audit-registry-field-usage.mjs.`
    );
  }

  return problems;
}

async function main() {
  const problems = auditRegistryFieldUsage();
  if (problems.length) {
    console.error('❌ Registry/engine parity audit failed:');
    for (const p of problems) console.error(`   • ${p}`);
    process.exitCode = 1;
  } else {
    console.log('✅ Registry/engine parity: every enforcement-relevant registry key is referenced in src/engine.mjs.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
