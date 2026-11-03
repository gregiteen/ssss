/**
 * `ssss upgrade` — move an installed capability bundle to a new version via
 * structural-only patch envelopes (spec §17.4). Refuses any tenant_private
 * modification.
 */
import fs from 'node:fs';
import path from 'node:path';
import { exportBundle, upgradeBundle, importBundle } from '../src/bundle.mjs';
import { createEngine } from '../src/engine.mjs';
import { parseArgs, usage, die, wantsHelp } from './lib/cli.mjs';

const HELP = usage({
  summary: 'Upgrade an installed bundle to a new version via structural-only patches (§17.4).',
  usage: 'ssss upgrade <bundle.ucw.json> --vault <dir> [options]',
  options: [
    ['--vault <dir>', 'Target vault directory. Required.'],
    ['--from <file>', 'Baseline bundle or plan (if omitted, exported from vault).'],
    ['--workspace <id>', 'Target workspace id (default: ws-upgrade).'],
    ['--prefix <path>', 'Path prefix for the bundle within the vault.'],
    ['--dry-run', 'Validate every patch envelope without committing.'],
    ['--json', 'Emit machine-readable JSON upgrade summary.'],
    ['--registry <dir>', 'Registry directory (default: core registry).'],
  ],
  examples: [
    'ssss upgrade festival-v2.ucw.json --vault ./tenant',
    'ssss upgrade festival-v2.ucw.json --vault ./tenant --dry-run',
    'ssss upgrade festival-v2.ucw.json --vault ./tenant --from festival-v1.ucw.json',
  ],
  seeAlso: ['ssss import', 'ssss provision', 'ssss export'],
});

export async function run(argv) {
  if (wantsHelp(argv)) { console.log(HELP); return; }
  const { positionals, flags } = parseArgs(argv, { booleans: ['dry-run', 'json'] });
  const file = positionals[0];
  if (!file) die('upgrade needs a new bundle file.\n\n' + HELP);
  if (!fs.existsSync(file)) die(`no such file: ${file}`);
  if (!flags.vault) die('upgrade needs --vault <dir>.\n\n' + HELP);

  const vault = path.resolve(flags.vault);
  if (!fs.existsSync(vault)) die(`no such vault directory: ${vault}`);

  let nextBundle;
  try { nextBundle = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (err) { die(`bundle is not valid JSON: ${err.message}`); }

  let installedBundle;
  if (flags.from) {
    if (!fs.existsSync(flags.from)) die(`no such baseline file: ${flags.from}`);
    try { installedBundle = JSON.parse(fs.readFileSync(flags.from, 'utf8')); }
    catch (err) { die(`baseline file is not valid JSON: ${err.message}`); }
  } else {
    try {
      installedBundle = exportBundle(vault, {
        profile: 'backup',
        registryDir: flags.registry,
      });
    } catch (err) {
      die(`failed to inspect current vault state: ${err.message}`);
    }
  }

  const upgrade = upgradeBundle(installedBundle, nextBundle, {
    workspaceId: flags.workspace || 'ws-upgrade',
    pathPrefix: flags.prefix || '',
    dryRun: !!flags['dry-run'],
    registryDir: flags.registry,
  });

  if (!upgrade.ok) {
    for (const e of upgrade.errors) console.error(`✗ upgrade error: ${e}`);
    process.exit(1);
  }

  const declared = nextBundle?.manifest?.required_extensions;
  const registryNames = Array.isArray(declared) && declared.length ? declared : null;
  const engine = createEngine({ registryDir: flags.registry, ...(registryNames ? { registryNames } : {}) });

  const result = await importBundle(upgrade.plan, vault, engine);
  const failed = result.results.filter((r) => !r.success);

  if (flags.json) {
    const summary = {
      ok: result.ok,
      from_version: upgrade.fromVersion,
      to_version: upgrade.toVersion,
      migration: upgrade.migration,
      patches_count: upgrade.patchesCount,
      operations_count: upgrade.operationsCount,
      committed: result.committed,
      would_commit: result.wouldCommit,
      failed_count: failed.length,
      dry_run: !!flags['dry-run'],
    };
    console.log(JSON.stringify(summary, null, 2));
    if (!result.ok) process.exit(1);
    return;
  }

  if (flags['dry-run']) {
    console.log(`${result.ok ? '✓' : '✗'} upgrade dry-run ${upgrade.fromVersion} → ${upgrade.toVersion}: ${result.wouldCommit || 0} would apply, ${upgrade.plan.length - (result.wouldCommit || 0)} unchanged, ${failed.length} failed → ${vault}`);
  } else {
    console.log(`${result.ok ? '✓' : '✗'} upgrade ${upgrade.fromVersion} → ${upgrade.toVersion}: ${result.committed} committed, ${upgrade.plan.length - result.committed} unchanged, ${failed.length} failed → ${vault}`);
  }

  if (failed.length) {
    for (const r of failed) console.error(`  ✗ ${r.path}: ${(r.validation?.errors || []).join('; ')}`);
    process.exit(1);
  }
}
