/**
 * `ssss schema` — inspect, export, and validate against the canonical Draft 2020-12
 * JSON Schemas for SSSS registries (`schemas/core-registry.schema.json`) and
 * `.ucw` transport bundles (`schemas/bundle.schema.json`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getCoreRegistrySchema,
  getBundleSchema,
  validateJsonSchema,
} from '../src/schema-validator.mjs';
import { parseArgs, usage, die, wantsHelp } from './lib/cli.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCHEMAS_DIR = path.resolve(ROOT, 'schemas');

const HELP = usage({
  summary: 'Output, export, or validate against the canonical SSSS Draft 2020-12 JSON Schemas.',
  usage: 'ssss schema <core|bundle|export|validate> [target] [options]',
  options: [
    ['--out <path>', 'Destination file (core/bundle) or directory (export; default: ./schemas).'],
    ['--type <core|bundle>', 'Target schema kind for `validate` (auto-detected when omitted).'],
    ['--schema <file>', 'Custom JSON Schema file path for `validate`.'],
    ['--json', 'Emit machine-readable JSON output for `export` or `validate`.'],
    ['--quiet', 'Suppress human-readable output on valid `validate` check.'],
  ],
  examples: [
    'ssss schema core',
    'ssss schema bundle --out ./bundle.schema.json',
    'ssss schema export --out ./schemas',
    'ssss schema validate registry/core.json',
    'ssss schema validate conformance/reference-bundle.ucw.json --type bundle',
  ],
  seeAlso: ['ssss registry', 'ssss validate', 'ssss help schema'],
});

function emit(value, output) {
  const text = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
  if (output) {
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(path.resolve(output), text, { encoding: 'utf8' });
  } else {
    process.stdout.write(text);
  }
}

function detectSchemaType(data, explicitType) {
  if (explicitType === 'core' || explicitType === 'registry') return 'core';
  if (explicitType === 'bundle') return 'bundle';
  if (explicitType) {
    die(`Unknown --type '${explicitType}'. Use 'core' or 'bundle'.`);
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    if (typeof data.$schema === 'string') {
      if (data.$schema.includes('bundle.schema.json')) return 'bundle';
      if (data.$schema.includes('core-registry.schema.json') || data.$schema.includes('registry')) return 'core';
    }
    if ('manifest' in data || 'files' in data) return 'bundle';
    if ('registry' in data || 'document_primitives' in data) return 'core';
  }
  return 'core';
}

export async function run(argv) {
  if (wantsHelp(argv)) { console.log(HELP); return; }
  const verb = argv[0];
  const { positionals, flags } = parseArgs(argv.slice(1), {
    booleans: ['json', 'quiet'],
    alias: { j: 'json', q: 'quiet' },
  });

  try {
    const coreSchemaPath = path.join(SCHEMAS_DIR, 'core-registry.schema.json');
    const bundleSchemaPath = path.join(SCHEMAS_DIR, 'bundle.schema.json');

    if (verb === 'core') {
      const content = fs.readFileSync(coreSchemaPath, 'utf8');
      emit(content, flags.out);
      return;
    }
    if (verb === 'bundle') {
      const content = fs.readFileSync(bundleSchemaPath, 'utf8');
      emit(content, flags.out);
      return;
    }
    if (verb === 'export') {
      const targetDir = path.resolve(flags.out || './schemas');
      fs.mkdirSync(targetDir, { recursive: true });
      const written = [
        path.join(targetDir, 'core-registry.schema.json'),
        path.join(targetDir, 'bundle.schema.json'),
      ];
      fs.copyFileSync(coreSchemaPath, written[0]);
      fs.copyFileSync(bundleSchemaPath, written[1]);
      if (flags.json) {
        console.log(JSON.stringify({ exported: written, directory: targetDir }, null, 2));
      } else {
        console.log(`Exported canonical schemas to ${targetDir}`);
      }
      return;
    }
    if (verb === 'validate') {
      const file = positionals[0];
      if (!file) die(`validate requires a target JSON file.\n\n${HELP}`);
      const resolvedFile = path.resolve(file);
      if (!fs.existsSync(resolvedFile)) die(`no such file: ${file}`);
      let data;
      try {
        data = JSON.parse(fs.readFileSync(resolvedFile, 'utf8'));
      } catch (err) {
        die(`not valid JSON (${file}): ${err.message}`);
      }

      let schema;
      let schemaLabel;
      if (flags.schema) {
        const customSchemaPath = path.resolve(flags.schema);
        if (!fs.existsSync(customSchemaPath)) die(`no such schema file: ${flags.schema}`);
        schema = JSON.parse(fs.readFileSync(customSchemaPath, 'utf8'));
        schemaLabel = flags.schema;
      } else {
        const kind = detectSchemaType(data, flags.type);
        schema = kind === 'bundle' ? getBundleSchema() : getCoreRegistrySchema();
        schemaLabel = kind;
      }

      const { valid, errors } = validateJsonSchema(data, schema);
      if (flags.json) {
        console.log(JSON.stringify({ valid, schema: schemaLabel, file, errors }, null, 2));
        if (!valid) process.exit(1);
        return;
      }
      if (valid) {
        if (!flags.quiet) {
          console.log(`✓ valid — ${file} (${schemaLabel} schema)`);
        }
        return;
      }
      console.error(`✗ invalid — ${errors.length} error(s) in ${file}:`);
      for (const e of errors) {
        console.error(`  - ${e.path ? `${e.path}: ` : ''}${e.message}`);
      }
      process.exit(1);
    }
    die(`Unknown schema verb '${verb || ''}'.\n\n${HELP}`);
  } catch (error) {
    die(error.message);
  }
}
