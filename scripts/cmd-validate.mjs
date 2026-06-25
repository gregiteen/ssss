/**
 * `ssss validate` — check a `.ucw` bundle against the registry bundle schema
 * (§16) and the §5.5 portability/profile conformance rules. Exits non-zero on
 * any error so it can gate CI.
 */
import fs from 'node:fs';
import { validateBundle } from '../src/bundle.mjs';
import { parseArgs, usage, die, wantsHelp } from './lib/cli.mjs';

const HELP = usage({
  summary: 'Validate a .ucw bundle against the SSSS bundle schema (spec §16/§5.5).',
  usage: 'ssss validate <bundle.ucw.json> [options]',
  options: [
    ['--registry <dir>', 'Registry directory (default: the package core registry).'],
    ['--quiet', 'Print nothing on success; only exit code 0/1.'],
  ],
  examples: ['ssss validate festival.ucw.json'],
  seeAlso: ['ssss export', 'ssss inspect', 'ssss help bundle'],
});

export async function run(argv) {
  if (wantsHelp(argv)) { console.log(HELP); return; }
  const { positionals, flags } = parseArgs(argv, { booleans: ['quiet'] });
  const file = positionals[0];
  if (!file) die('validate needs a bundle file.\n\n' + HELP);
  if (!fs.existsSync(file)) die(`no such file: ${file}`);

  let bundle;
  try { bundle = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (err) { die(`not valid JSON: ${err.message}`); }

  const { valid, errors } = validateBundle(bundle, { registryDir: flags.registry });
  if (valid) {
    if (!flags.quiet) {
      const m = bundle.manifest || {};
      console.log(`✓ valid — "${m.name}" · profile ${m.export_profile} · ${m.file_count} file(s) · core v${m.ssss_core_version}`);
    }
    return;
  }
  console.error(`✗ invalid — ${errors.length} error(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
