/**
 * `ssss new` — scaffold a fresh repo wired for SSSS (and, optionally, Total Recall).
 *
 * Produces a ready-to-run project: a starter `vault/` of core primitives, the
 * `@gregiteen/ssss-cli` dependency pinned to this CLI's own version tag, a dependency-free
 * conformance test (`node --test`) that replays the canonical fixtures through the
 * engine AND round-trips the vault as a `sale` bundle, plus a CLAUDE.md describing
 * the conventions. With `--with-total-recall` it also wires the Total Recall
 * memory OS. Dependency-free; uses only Node built-ins.
 *
 * All shelling-out uses execFileSync (no shell) with fixed argument vectors —
 * never string interpolation — so there is no command-injection surface.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, usage, die, wantsHelp } from './lib/cli.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VERSION = (() => {
  try { return fs.readFileSync(path.resolve(HERE, '..', 'VERSION'), 'utf8').trim(); }
  catch { return '0.0.0'; }
})();

const HELP = usage({
  summary: 'Scaffold a new repo wired for SSSS (and optionally Total Recall).',
  usage: 'ssss new <dir> [options]',
  options: [
    ['--name <s>', 'Package name (default: the target directory name).'],
    ['--with-total-recall', 'Also wire the Total Recall memory OS (total-recall-brain).'],
    ['--install', 'Run `npm install` after scaffolding (and Total Recall init if requested).'],
    ['--no-git', 'Do not run `git init`.'],
    ['--ref <git-ref>', `Pin @gregiteen/ssss-cli to this ref (default: v${VERSION}).`],
    ['--force', 'Allow scaffolding into a non-empty directory.'],
  ],
  examples: [
    'ssss new my-app',
    'ssss new my-app --with-total-recall --install',
  ],
  seeAlso: ['ssss help scaffold', 'ssss export', 'ssss conformance'],
});

const W = (root, rel, content) => {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
};

/** Run a fixed command with no shell; returns true on success. */
function tryRun(file, args, cwd, stdio = 'inherit') {
  try { execFileSync(file, args, { cwd, stdio }); return true; }
  catch { return false; }
}

export async function run(argv) {
  if (wantsHelp(argv)) { console.log(HELP); return; }
  const { positionals, flags } = parseArgs(argv, {
    booleans: ['with-total-recall', 'install', 'no-git', 'force'],
  });
  const target = positionals[0];
  if (!target) die('new needs a target directory.\n\n' + HELP);

  const root = path.resolve(target);
  const name = flags.name || path.basename(root);
  const ref = flags.ref || `v${VERSION}`;
  const withTR = !!flags['with-total-recall'];

  if (fs.existsSync(root) && fs.readdirSync(root).length && !flags.force) {
    die(`${root} is not empty. Use --force to scaffold anyway.`);
  }
  fs.mkdirSync(root, { recursive: true });

  // ── package.json ────────────────────────────────────────────────────────
  const pkg = {
    name, version: '0.1.0', private: true, type: 'module',
    description: 'An SSSS-native project — Markdown vault as source of truth.',
    scripts: {
      ssss: 'ssss',
      test: 'node --test',
      export: 'ssss export vault --profile sale --out dist/bundle.ucw.json',
      validate: 'ssss conformance --engine',
    },
    dependencies: { '@gregiteen/ssss-cli': `github:gregiteen/ssss#${ref}` },
    ...(withTR ? { devDependencies: { 'total-recall-brain': 'latest' } } : {}),
  };
  W(root, 'package.json', JSON.stringify(pkg, null, 2) + '\n');

  // ── starter vault (core primitives; the task is tenant_private) ──────────
  W(root, 'vault/rules/welcome.md',
    '---\ntype: rule\ntitle: Welcome Rule\ndescription: Starter structural rule for an SSSS-native app.\ntimestamp: 2026-07-02T00:00:00Z\nname: Welcome Rule\n---\n\n# Welcome\n\nA starter **structural** rule — the kind of thing that ships in a `sale` bundle.\n');
  W(root, 'vault/workflows/onboarding.md',
    '---\ntype: workflow\ntitle: Onboarding\ndescription: Starter workflow that applies the welcome rule and greets the operator.\ntimestamp: 2026-07-02T00:00:00Z\nname: Onboarding\n---\n\n# Onboarding\n\n1. Apply the [[welcome]] rule.\n2. Greet the operator.\n');
  W(root, 'vault/assistants/concierge.md',
    '---\ntype: assistant\ntitle: Concierge\ndescription: Starter assistant definition for the project.\ntimestamp: 2026-07-02T00:00:00Z\nname: Concierge\n---\n\n# Concierge\n\nA starter assistant definition.\n');
  W(root, 'vault/tasks/first-task.md',
    '---\ntype: task\ntitle: First Task\ndescription: Starter private setup task that demonstrates tenant_private filtering.\ntimestamp: 2026-07-02T00:00:00Z\npriority: normal\ncategory: setup\nstatus: pending\n---\n\n# First task\n\nThis is `tenant_private` (§5.5) — it is **dropped** from `template`/`sale` exports.\n');

  // ── conformance test (zero-dependency: node --test) ─────────────────────
  W(root, 'test/ssss-conformance.test.mjs', CONFORMANCE_TEST);

  // ── repo meta ───────────────────────────────────────────────────────────
  W(root, '.gitignore', 'node_modules/\ndist/\n*.ucw.json\n.DS_Store\n');
  W(root, 'README.md', readme(name, withTR));
  W(root, 'CLAUDE.md', claudeMd(name, withTR));

  // ── git + install (best-effort, flag-gated, no shell) ───────────────────
  const log = (m) => console.error(m);
  log(`Scaffolded SSSS project → ${root}`);
  log(`  @gregiteen/ssss-cli pinned to github:gregiteen/ssss#${ref}`);
  if (withTR) log('  Total Recall wired (total-recall-brain).');

  if (!flags['no-git'] && !fs.existsSync(path.join(root, '.git'))) {
    if (tryRun('git', ['init', '-q'], root, 'ignore')) log('  git initialized.');
  }

  if (flags.install) {
    log('\nInstalling dependencies (npm install)…');
    if (!tryRun('npm', ['install', '--no-audit', '--no-fund'], root)) {
      die('scaffolded, but `npm install` failed. Finish manually with the steps below.', 1);
    }
    if (withTR) {
      log('\nInitializing Total Recall memory vault…');
      tryRun('npx', ['-p', 'total-recall-brain', 'total-recall', 'init'], root);
    }
    log('\nVerifying the toolchain (npm test)…');
    if (!tryRun('npm', ['test'], root)) {
      die('scaffolded and installed, but `npm test` failed. Inspect the output above.', 1);
    }
  }

  // ── next steps ──────────────────────────────────────────────────────────
  console.log(`\n✓ ${name} is ready.\n`);
  console.log('Next steps:');
  console.log(`  cd ${path.relative(process.cwd(), root) || '.'}`);
  if (!flags.install) {
    console.log('  npm install');
    if (withTR) console.log('  npx -p total-recall-brain total-recall init   # seed the memory vault');
  }
  console.log('  npm test                       # replays the canonical fixtures + round-trips the vault');
  console.log('  npx ssss export vault --profile sale --out dist/bundle.ucw.json');
  console.log('  npx ssss help                  # explore the standard');
}

const CONFORMANCE_TEST = `/**
 * SSSS conformance — proves this repo's toolchain matches the published standard.
 * Zero test dependencies: run with \`node --test\` (Node 18+).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEngine } from '@gregiteen/ssss-cli/engine';
import { exportBundle, validateBundle, provisionBundle, importBundle } from '@gregiteen/ssss-cli/bundle';

const require = createRequire(import.meta.url);
const { fixtures } = require('@gregiteen/ssss-cli/conformance/fixtures.json');
const VAULT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'vault');

test('engine implements the canonical Operation Contract (spec §6)', async () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-conf-'));
  const engine = createEngine();
  try {
    for (const f of fixtures) {
      const res = await engine.processOperation(JSON.parse(JSON.stringify(f.request)), vault);
      const exp = f.expected_response;
      if (exp.success !== undefined) assert.equal(res.success, exp.success, f.id + ' success');
      if (exp.validation && exp.validation.valid !== undefined) {
        assert.equal(res.validation && res.validation.valid, exp.validation.valid, f.id + ' valid');
      }
    }
  } finally { fs.rmSync(vault, { recursive: true, force: true }); }
});

test('this vault exports, validates, and round-trips as a sale bundle (spec §16/§17)', async () => {
  const bundle = exportBundle(VAULT, { profile: 'sale', name: 'starter' });
  const { valid, errors } = validateBundle(bundle);
  assert.ok(valid, 'bundle invalid: ' + errors.join('; '));
  assert.ok(!bundle.files.some((f) => f.path.startsWith('tasks/')), 'tenant_private leaked into sale export');

  const plan = provisionBundle(bundle, { workspaceId: 'ws-test' });
  assert.ok(plan.ok, 'provision failed: ' + JSON.stringify(plan.unresolved) + ' ' + JSON.stringify(plan.danglingLinks));

  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-import-'));
  try {
    const engine = createEngine();
    const r1 = await importBundle(plan.plan, target, engine);
    assert.ok(r1.ok && r1.committed === bundle.files.length, 'import did not commit every file');
    const r2 = await importBundle(plan.plan, target, engine);
    assert.equal(r2.committed, 0, 're-import was not idempotent');
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});
`;

function readme(name, withTR) {
  return `# ${name}

An [SSSS](https://github.com/gregiteen/ssss)-native project: a Markdown **vault** is
the source of truth, validated and packaged by the dependency-free \`@gregiteen/ssss-cli\`.

## Layout

\`\`\`
vault/         Your SSSS documents (structural + tenant_private primitives).
test/          Conformance test — replays the canonical fixtures + round-trips the vault.
\`\`\`

## Use

\`\`\`bash
npm install
npm test                              # prove the toolchain + vault are conformant
npx ssss export vault --profile sale --out dist/bundle.ucw.json   # a tradeable bundle
npx ssss inspect dist/bundle.ucw.json --files
npx ssss help portability             # why a sale export is safe to share
\`\`\`

The \`sale\` profile ships every \`structural\` primitive and **drops** \`tenant_private\`
ones (the starter \`vault/tasks/\` file) — see \`ssss help portability\`.
${withTR ? `
## Total Recall (memory OS)

This project is also wired for [Total Recall](https://github.com/gregiteen/total-recall):

\`\`\`bash
npx -p total-recall-brain total-recall init      # seed .agent/skills/total-recall
npx total-recall remember fact "..."             # persist a fact
npx total-recall recall "..."                    # semantic recall
\`\`\`
` : ''}`;
}

function claudeMd(name, withTR) {
  return `# ${name} — agent guide

This repo uses **SSSS** (Structured Semantic Syntax System) as its state contract.

## Source of truth
- \`vault/\` is the only source of truth — typed Markdown documents with YAML
  frontmatter. Every file declares a \`type\` defined in the \`@gregiteen/ssss-cli\` core registry.
- Mutate the vault through the standard, not by hand-writing files in bulk:
  \`npx ssss\` for bundle/tenant tooling, or the \`@gregiteen/ssss-cli/engine\` Operation Contract
  in code.

## Portability (§5.5) — the rule that matters
- \`structural\` documents (rules, workflows, pages, assistants) are the sellable model.
- \`tenant_private\` documents (tasks, customer data) are **never** shipped in a
  \`template\`/\`sale\` export.
- Run \`npx ssss help portability\` before adding a new document type.

## Verify before claiming done
- \`npm test\` replays the canonical Operation Contract fixtures through the engine
  and round-trips \`vault/\` as a \`sale\` bundle. Keep it green.
${withTR ? `
## Memory (Total Recall)
- Persistent rules/decisions live in \`.agent/skills/total-recall\` via the
  \`npx total-recall remember\` / \`recall\` CLI. Save corrections and decisions there.
` : ''}`;
}
