/**
 * `ssss import` — replay a bundle (or a pre-built plan) into a target vault via
 * the reference engine (spec §17.1). Idempotent: each envelope's idempotency key
 * makes a re-run commit nothing new. Provisions inline unless `--plan` is given.
 */
import fs from 'node:fs';
import path from 'node:path';
import { provisionBundle, importBundle } from '../src/bundle.mjs';
import { createEngine } from '../src/engine.mjs';
import { parseArgs, parseKeyValues, usage, die, wantsHelp } from './lib/cli.mjs';

const HELP = usage({
  summary: 'Replay a bundle/plan into a target vault via the reference engine (§17).',
  usage: 'ssss import <bundle.ucw.json> --vault <dir> [options]',
  options: [
    ['--vault <dir>', 'Target vault directory (created if missing). Required.'],
    ['--plan <file>', 'Import a pre-built plan (from `ssss provision`) instead of the bundle.'],
    ['--param <k=v>', 'Bind a bundle parameter (repeatable).'],
    ['--workspace <id>', 'Target workspace id (default: ws-provision).'],
    ['--prefix <path>', 'Place every file under this path prefix (id-remap).'],
    ['--dry-run', 'Validate every envelope without committing.'],
    ['--registry <dir>', 'Registry directory (default: the package core registry).'],
  ],
  examples: [
    'ssss import festival.ucw.json --vault ./new-tenant --param domain=acme.live',
    'ssss provision festival.ucw.json --out plan.json && ssss import --plan plan.json --vault ./t',
  ],
  seeAlso: ['ssss provision', 'ssss export', 'ssss help provisioning'],
});

export async function run(argv) {
  if (wantsHelp(argv)) { console.log(HELP); return; }
  const { positionals, flags } = parseArgs(argv, { booleans: ['dry-run'], multi: ['param'] });
  if (!flags.vault) die('import needs --vault <dir>.\n\n' + HELP);
  const vault = path.resolve(flags.vault);
  fs.mkdirSync(vault, { recursive: true });

  let envelopes;
  if (flags.plan) {
    if (!fs.existsSync(flags.plan)) die(`no such plan: ${flags.plan}`);
    const plan = JSON.parse(fs.readFileSync(flags.plan, 'utf8'));
    envelopes = plan.envelopes || plan;
  } else {
    const file = positionals[0];
    if (!file) die('import needs a bundle file (or --plan).\n\n' + HELP);
    if (!fs.existsSync(file)) die(`no such file: ${file}`);
    const bundle = JSON.parse(fs.readFileSync(file, 'utf8'));
    const prov = provisionBundle(bundle, {
      parameters: parseKeyValues(flags.param),
      workspaceId: flags.workspace || 'ws-provision',
      pathPrefix: flags.prefix || '',
      dryRun: !!flags['dry-run'],
    });
    if (!prov.ok) {
      if (prov.unresolved.length) console.error(`✗ unresolved parameter(s): ${prov.unresolved.join(', ')}`);
      for (const d of prov.danglingLinks) console.error(`✗ dangling link: ${d.file} → [[${d.ref}]]`);
      for (const e of prov.errors || []) console.error(`✗ bundle validation: ${e}`);
      process.exit(1);
    }
    envelopes = prov.plan;
  }

  const engine = createEngine({ registryDir: flags.registry });
  const result = await importBundle(envelopes, vault, engine);
  const failed = result.results.filter((r) => !r.success);
  if (flags['dry-run']) {
    console.log(`${result.ok ? '✓' : '✗'} import dry-run — ${result.wouldCommit || 0} would commit, ${envelopes.length - (result.wouldCommit || 0)} unchanged (idempotent), ${failed.length} failed → ${vault}`);
  } else {
    console.log(`${result.ok ? '✓' : '✗'} import — ${result.committed} committed, ${envelopes.length - result.committed} unchanged (idempotent), ${failed.length} failed → ${vault}`);
  }
  if (failed.length) {
    for (const r of failed) console.error(`  ✗ ${r.path}: ${(r.validation?.errors || []).join('; ')}`);
    process.exit(1);
  }
}
