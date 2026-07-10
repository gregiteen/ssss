/** Non-destructive 0.8 -> 0.9 migration diagnostics and backup manifest. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs, die, wantsHelp } from './lib/cli.mjs';

function walk(root, dir = root, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) walk(root, absolute, out); else if (entry.isFile()) out.push(path.relative(root, absolute).split(path.sep).join('/'));
  }
  return out.sort();
}
export async function run(argv) {
  if (wantsHelp(argv)) { console.log('Usage: ssss migrate 0.8-to-0.9 <vault> [--out <report.json>]'); return; }
  if (argv[0] !== '0.8-to-0.9' || !argv[1]) die('Expected migrate 0.8-to-0.9 <vault>.');
  const { flags } = parseArgs(argv.slice(2));
  const root = fs.realpathSync(path.resolve(argv[1]));
  const files = walk(root);
  const translationArtifacts = files.filter((file) => /(^|\/)translations?\//i.test(file) || /translation/i.test(fs.readFileSync(path.join(root, file), 'utf8').slice(0, 2048)));
  const backup = files.map((file) => ({ path: file, hash: `sha256:${crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')}` }));
  const report = { migration: '0.8-to-0.9', dry_run: true, source: root, backup_manifest: backup, diagnostics: { translation_artifacts: translationArtifacts, required_actions: translationArtifacts.length ? ['Preserve canonical authored content; archive obsolete translation overlays outside the vault.'] : [] }, writes_performed: 0 };
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (flags.out) fs.writeFileSync(path.resolve(flags.out), text, { flag: 'wx', mode: 0o600 }); else process.stdout.write(text);
}
