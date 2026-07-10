/**
 * `ssss export` — package a vault directory into a `.ucw` bundle (spec §16).
 *
 * Pure and deterministic: the same vault + profile always yields a byte-identical
 * bundle (frozen `exported_at`, content-hashed). Profile filtering enforces the
 * §5.5 portability rules — `template`/`sale` drop every `tenant_private` file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_EXPORTER, exportBundle } from '../src/bundle.mjs';
import { parseArgs, usage, die, wantsHelp } from './lib/cli.mjs';

const HELP = usage({
  summary: 'Package an SSSS vault directory into a transportable .ucw bundle (spec §16).',
  usage: 'ssss export <vault-dir> [options]',
  options: [
    ['--profile <p>', 'Export profile: backup | template | sale (default: backup).'],
    ['--out <file>', 'Write the bundle here (default: stdout).'],
    ['--name <s>', 'Bundle display name.'],
    ['--description <s>', 'Bundle description.'],
    ['--bundle-version <s>', 'Bundle version string (default: 0.1.0).'],
    ['--exporter <s>', `Exporter id recorded in provenance (default: ${DEFAULT_EXPORTER}).`],
    ['--ext <name>', 'Declare a required extension registry (repeatable).'],
    ['--exported-at <iso>', 'Override the export timestamp (default: epoch, for determinism).'],
    ['--registry <dir>', 'Registry directory (default: the package core registry).'],
    ['--show-dropped', 'Print the files excluded by the profile to stderr.'],
  ],
  examples: [
    'ssss export ./my-vault --profile sale --out festival.ucw.json',
    'ssss export ./my-vault --profile backup --name "Nightly" --out backup.ucw.json',
  ],
  seeAlso: ['ssss validate', 'ssss inspect', 'ssss help portability'],
});

export async function run(argv) {
  if (wantsHelp(argv)) { console.log(HELP); return; }
  const { positionals, flags } = parseArgs(argv, {
    booleans: ['show-dropped'],
    multi: ['ext'],
  });
  const vault = positionals[0];
  if (!vault) die('export needs a vault directory.\n\n' + HELP);
  if (!fs.existsSync(vault) || !fs.statSync(vault).isDirectory()) die(`not a directory: ${vault}`);

  let bundle;
  try {
    bundle = exportBundle(path.resolve(vault), {
      profile: flags.profile || 'backup',
      registryDir: flags.registry,
      name: flags.name || path.basename(path.resolve(vault)),
      description: flags.description || '',
      version: flags['bundle-version'] || '0.1.0',
      exporter: flags.exporter || DEFAULT_EXPORTER,
      requiredExtensions: flags.ext || [],
      ...(flags['exported-at'] ? { exportedAt: flags['exported-at'] } : {}),
    });
  } catch (err) { die(err.message); }

  if (flags['show-dropped'] && bundle._dropped.length) {
    console.error(`Dropped ${bundle._dropped.length} file(s) excluded by profile '${bundle.manifest.export_profile}':`);
    for (const d of bundle._dropped) console.error(`  - ${d.path} (${d.type || 'untyped'} · ${d.portability})`);
  }

  const out = { manifest: bundle.manifest, files: bundle.files };
  const json = JSON.stringify(out, null, 2);
  if (flags.out) {
    fs.writeFileSync(flags.out, json + '\n');
    console.error(`Wrote ${out.files.length} file(s) → ${flags.out} (${bundle.manifest.provenance.content_hash}).`);
  } else {
    process.stdout.write(json + '\n');
  }
}
