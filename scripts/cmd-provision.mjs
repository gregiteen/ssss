/**
 * `ssss provision` — turn a `.ucw` bundle + parameters into a replayable plan of
 * Operation Contract envelopes (spec §17). Pure: touches no filesystem. Resolves
 * required parameters, checks link integrity under id-remap (§17.3), and assigns
 * deterministic idempotency keys so a later `import` is a no-op on re-run.
 */
import fs from 'node:fs';
import { provisionBundle } from '../src/bundle.mjs';
import { parseArgs, parseKeyValues, usage, die, wantsHelp } from './lib/cli.mjs';

const HELP = usage({
  summary: 'Plan a bundle install: resolve params + link integrity → replayable envelopes (§17).',
  usage: 'ssss provision <bundle.ucw.json> [options]',
  options: [
    ['--param <k=v>', 'Bind a bundle parameter (repeatable).'],
    ['--workspace <id>', 'Target workspace id (default: ws-provision).'],
    ['--prefix <path>', 'Place every file under this path prefix (id-remap).'],
    ['--out <file>', 'Write the envelope plan here (default: stdout).'],
    ['--dry-run', 'Mark every envelope dry_run (import will validate, not commit).'],
  ],
  examples: [
    'ssss provision festival.ucw.json --param business_name="Acme Fest" --param domain=acme.live',
    'ssss provision festival.ucw.json --workspace ws-42 --out plan.json',
  ],
  seeAlso: ['ssss import', 'ssss inspect', 'ssss help provisioning'],
});

export async function run(argv) {
  if (wantsHelp(argv)) { console.log(HELP); return; }
  const { positionals, flags } = parseArgs(argv, { booleans: ['dry-run'], multi: ['param'] });
  const file = positionals[0];
  if (!file) die('provision needs a bundle file.\n\n' + HELP);
  if (!fs.existsSync(file)) die(`no such file: ${file}`);

  let bundle;
  try { bundle = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (err) { die(`not valid JSON: ${err.message}`); }

  const result = provisionBundle(bundle, {
    parameters: parseKeyValues(flags.param),
    workspaceId: flags.workspace || 'ws-provision',
    pathPrefix: flags.prefix || '',
    dryRun: !!flags['dry-run'],
  });

  if (result.unresolved.length) {
    console.error(`✗ unresolved required parameter(s): ${result.unresolved.join(', ')}`);
    console.error('  supply them with --param key=value');
  }
  if (result.danglingLinks.length) {
    console.error(`✗ ${result.danglingLinks.length} dangling internal link(s):`);
    for (const d of result.danglingLinks) console.error(`  - ${d.file} → [[${d.ref}]]`);
  }

  const plan = { workspace_id: flags.workspace || 'ws-provision', steps: result.steps, envelopes: result.plan };
  const json = JSON.stringify(plan, null, 2);
  if (flags.out) {
    fs.writeFileSync(flags.out, json + '\n');
    console.error(`Wrote ${result.plan.length} envelope(s) → ${flags.out}.`);
  } else {
    process.stdout.write(json + '\n');
  }
  if (!result.ok) process.exit(1);
}
