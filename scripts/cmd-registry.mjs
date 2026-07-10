/** Effective registry composition and integrity-lock commands. */
import fs from 'node:fs';
import path from 'node:path';
import { composeRegistryLayers, createRegistryLock, loadRegistries, verifyRegistryLock } from '../src/registry.mjs';
import { parseArgs, die, wantsHelp } from './lib/cli.mjs';

const HELP = 'Usage: ssss registry compose|lock|verify [--extension <file> ...] [--lock <file>] [--out <file>]';
const read = (file) => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
function serializable(set) { return { primitives: Object.fromEntries(set.primitives), aliases: Object.fromEntries(set.aliases), extension_versions: Object.fromEntries(set.extensionVersions) }; }
export async function run(argv) {
  if (wantsHelp(argv)) { console.log(HELP); return; }
  const verb = argv[0];
  const { flags } = parseArgs(argv.slice(1), { multi: ['extension'] });
  try {
    const base = loadRegistries();
    const set = composeRegistryLayers({ core: base.core, repository: (flags.extension || []).map(read) });
    let result;
    if (verb === 'compose') result = serializable(set);
    else if (verb === 'lock') result = createRegistryLock(set);
    else if (verb === 'verify') { if (!flags.lock) die('verify requires --lock <file>.'); result = verifyRegistryLock(set, read(flags.lock)); }
    else die(`Unknown registry verb '${verb || ''}'.\n${HELP}`);
    const text = `${JSON.stringify(result, null, 2)}\n`;
    if (flags.out) fs.writeFileSync(path.resolve(flags.out), text, { flag: 'wx', mode: 0o600 }); else process.stdout.write(text);
  } catch (error) { die(error.message); }
}
