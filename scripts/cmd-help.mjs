/**
 * `ssss help [topic]` — query the local documentation shipped with the package.
 *
 * Topics are Markdown files under `docs/help/`. With no argument it lists them;
 * with a topic it prints that file. No network, no dependencies — the docs travel
 * with the CLI so they work offline and match the installed version.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib/cli.mjs';

const HELP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'help');

function topics() {
  if (!fs.existsSync(HELP_DIR)) return [];
  return fs.readdirSync(HELP_DIR).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')).sort();
}

function firstLineSummary(topic) {
  const lines = fs.readFileSync(path.join(HELP_DIR, `${topic}.md`), 'utf8').split('\n');
  for (const l of lines) {
    const t = l.trim();
    if (t && !t.startsWith('#')) return t.replace(/[*`]/g, '');
  }
  return '';
}

export async function run(argv) {
  const { positionals, flags } = parseArgs(argv, { booleans: ['json'], alias: { j: 'json' } });
  const all = topics();
  const topic = positionals[0];

  if (flags.json) {
    if (topic) {
      const file = path.join(HELP_DIR, `${topic}.md`);
      if (!fs.existsSync(file)) { console.error(JSON.stringify({ error: `unknown topic '${topic}'`, topics: all })); process.exit(1); }
      console.log(JSON.stringify({ topic, content: fs.readFileSync(file, 'utf8') }));
    } else {
      console.log(JSON.stringify({ topics: all.map((t) => ({ topic: t, summary: firstLineSummary(t) })) }));
    }
    return;
  }

  if (!topic) {
    console.log('SSSS help topics — run `ssss help <topic>`:\n');
    const w = Math.max(...all.map((t) => t.length));
    for (const t of all) console.log(`  ${t.padEnd(w)}   ${firstLineSummary(t)}`);
    console.log('\nPer-command flags: `ssss <command> --help`.');
    return;
  }

  const file = path.join(HELP_DIR, `${topic}.md`);
  if (!fs.existsSync(file)) {
    console.error(`No help topic '${topic}'. Available: ${all.join(', ')}`);
    process.exit(1);
  }
  process.stdout.write(fs.readFileSync(file, 'utf8'));
  if (!fs.readFileSync(file, 'utf8').endsWith('\n')) process.stdout.write('\n');
}
