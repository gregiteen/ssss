/** `ssss localize` — materialize a non-destructive locale projection. */
import path from 'node:path';
import { materializeLocale } from '../src/semantic.mjs';
import { parseArgs, usage, die, wantsHelp } from './lib/cli.mjs';

const HELP = usage({
  summary: 'Materialize approved translation overlays as a derived vault projection (spec §11.9).',
  usage: 'ssss localize <vault-dir> --locale <tag> --out <empty-dir> [options]',
  options: [
    ['--locale <tag>', 'Required BCP47-style target locale.'],
    ['--out <dir>', 'Required empty directory outside the source vault.'],
    ['--include-private', 'Explicitly include private/resource-bound source documents.'],
    ['--include-drafts', 'Allow non-approved translation overlays.'],
    ['--registry <dir>', 'Registry directory (default: package registry).'],
  ],
  examples: [
    'ssss localize ./vault --locale es --out ./derived/es',
  ],
  seeAlso: ['ssss semantic', 'ssss help localization'],
});

export async function run(argv) {
  if (wantsHelp(argv)) { console.log(HELP); return; }
  const { positionals, flags } = parseArgs(argv, {
    booleans: ['include-private', 'include-drafts'],
  });
  const vault = positionals[0];
  if (!vault || !flags.locale || !flags.out) die('localize requires a vault, --locale, and --out.\n\n' + HELP);
  try {
    const manifest = materializeLocale(
      path.resolve(vault),
      flags.locale,
      path.resolve(flags.out),
      {
        includePrivate: !!flags['include-private'],
        includeDrafts: !!flags['include-drafts'],
        registryDir: flags.registry,
      }
    );
    process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
  } catch (error) {
    die(error.message);
  }
}
