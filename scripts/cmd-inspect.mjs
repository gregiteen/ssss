/**
 * `ssss inspect` — human-readable summary of a `.ucw` bundle: manifest,
 * primitive inventory, parameters, provisioning steps, and file list. Read-only.
 */
import fs from 'node:fs';
import { validateBundle } from '../src/bundle.mjs';
import { parseArgs, usage, die, wantsHelp } from './lib/cli.mjs';

const HELP = usage({
  summary: 'Print a human-readable summary of a .ucw bundle.',
  usage: 'ssss inspect <bundle.ucw.json> [options]',
  options: [
    ['--files', 'Also list every file path in the bundle.'],
    ['--registry <dir>', 'Registry directory used for the validity check.'],
  ],
  examples: ['ssss inspect festival.ucw.json --files'],
  seeAlso: ['ssss validate', 'ssss provision'],
});

export async function run(argv) {
  if (wantsHelp(argv)) { console.log(HELP); return; }
  const { positionals, flags } = parseArgs(argv, { booleans: ['files'] });
  const file = positionals[0];
  if (!file) die('inspect needs a bundle file.\n\n' + HELP);
  if (!fs.existsSync(file)) die(`no such file: ${file}`);

  let bundle;
  try { bundle = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (err) { die(`not valid JSON: ${err.message}`); }
  const m = bundle.manifest || {};
  const { valid, errors } = validateBundle(bundle, { registryDir: flags.registry });

  const L = [];
  L.push(`${m.name || '(unnamed)'}  —  v${m.version || '?'}`);
  if (m.description) L.push(`  ${m.description}`);
  L.push('');
  L.push(`  profile          ${m.export_profile}`);
  L.push(`  core version     ${m.ssss_core_version}`);
  L.push(`  required ext     ${(m.required_extensions || []).join(', ') || '(none)'}`);
  L.push(`  files            ${m.file_count}`);
  L.push(`  exported at      ${m.exported_at}`);
  L.push(`  exporter         ${m.provenance?.exporter || '?'}`);
  L.push(`  content hash     ${m.provenance?.content_hash || '?'}`);
  L.push(`  integrity        ${valid ? '✓ valid' : '✗ ' + errors.length + ' error(s)'}`);

  const inv = m.primitive_inventory || {};
  const invKeys = Object.keys(inv).sort();
  if (invKeys.length) {
    L.push('', '  Primitive inventory:');
    for (const k of invKeys) L.push(`    ${String(inv[k]).padStart(4)}  ${k}`);
  }

  if ((m.parameters || []).length) {
    L.push('', '  Parameters:');
    for (const p of m.parameters) {
      L.push(`    ${p.key}  (${p.type}, ${p.source}${p.required ? ', required' : ''})  ${p.label || ''}`);
    }
  }

  if ((m.provisioning || []).length) {
    L.push('', '  Provisioning steps:');
    for (const s of m.provisioning) {
      L.push(`    [${s.required ? '!' : ' '}] ${s.id}  ${s.system}/${s.mode}  ${s.label || ''}`);
    }
  }

  if (flags.files) {
    L.push('', '  Files:');
    for (const f of bundle.files || []) L.push(`    ${f.path}`);
  }

  console.log(L.join('\n'));
  if (!valid) {
    console.error('\nValidation errors:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
}
