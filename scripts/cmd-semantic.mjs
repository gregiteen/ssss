/** `ssss semantic` — build/query a deterministic, privacy-safe semantic projection. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildSemanticIndex, searchSemanticIndex } from '../src/semantic.mjs';
import { parseArgs, usage, die, wantsHelp } from './lib/cli.mjs';

const HELP = usage({
  summary: 'Build or query the deterministic SSSS semantic index (spec §11.9).',
  usage: 'ssss semantic <vault-dir> [options]',
  options: [
    ['--query <text>', 'Return ranked matches instead of the entire index.'],
    ['--language <tag>', 'Presentation/query language hint for an injected embedding or render adapter.'],
    ['--type <name>', 'Restrict query results to a primitive type (repeatable).'],
    ['--limit <n>', 'Maximum query results (default: 10).'],
    ['--include-private', 'Explicitly include tenant_private/resource_bound documents.'],
    ['--registry <dir>', 'Registry directory (default: package registry).'],
    ['--out <file>', 'Write JSON outside the vault instead of stdout.'],
  ],
  examples: [
    'ssss semantic ./vault --query "refund policy"',
    'ssss semantic ./vault --query "refund policy" --out ./derived/semantic.json',
  ],
  seeAlso: ['ssss help semantic'],
});

function physicalTarget(value) {
  const requested = path.resolve(value);
  let cursor = requested;
  const suffix = [];
  while (!fs.existsSync(cursor)) {
    suffix.unshift(path.basename(cursor));
    cursor = path.dirname(cursor);
  }
  return path.join(fs.realpathSync(cursor), ...suffix);
}

function writeOutsideVault(vault, output, content) {
  const source = fs.realpathSync(path.resolve(vault));
  const target = physicalTarget(output);
  if (target === source || target.startsWith(source + path.sep)) {
    throw new Error('Semantic projections must be written outside the source vault.');
  }
  if (fs.existsSync(target) && (fs.lstatSync(target).isSymbolicLink() || fs.statSync(target).isDirectory())) {
    throw new Error(`Output must be a regular file: ${target}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, target);
  return target;
}

export async function run(argv) {
  if (wantsHelp(argv)) { console.log(HELP); return; }
  const { positionals, flags } = parseArgs(argv, {
    booleans: ['include-private'],
    multi: ['type'],
  });
  const vault = positionals[0];
  if (!vault) die('semantic needs a vault directory.\n\n' + HELP);
  const limit = flags.limit === undefined ? 10 : Number(flags.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) die('--limit must be an integer from 1 to 1000.');

  try {
    const index = buildSemanticIndex(path.resolve(vault), {
      language: flags.language,
      includePrivate: !!flags['include-private'],
      registryDir: flags.registry,
    });
    const result = flags.query ? {
      query: flags.query,
      language: index.language,
      include_private: index.include_private,
      index_hash: index.index_hash,
      results: searchSemanticIndex(index, flags.query, { types: flags.type, limit }),
    } : index;
    const json = JSON.stringify(result, null, 2) + '\n';
    if (flags.out) {
      const target = writeOutsideVault(vault, flags.out, json);
      console.error(`Wrote semantic projection to ${target}`);
    } else process.stdout.write(json);
  } catch (error) {
    die(error.message);
  }
}
