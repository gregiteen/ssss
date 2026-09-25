#!/usr/bin/env node
/**
 * code-quality / detect.mjs — probe a repo and propose a config.json.
 *
 * This is a BOOTSTRAP, not the source of truth. It reports what the repo
 * actually has so a human (or agent) can write a tailored config. Every repo's
 * real gate list — SSSS conformance, registry validation, contract tests,
 * language-specific linters — is repo knowledge that belongs in config.json and
 * in that repo's SKILL.md, not in a generic detector.
 *
 *   node detect.mjs            # print findings + proposed config
 *   node detect.mjs --write    # write config.json if absent
 *   node detect.mjs --write --force
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SKILL_DIR, '../../..');
const CONFIG_PATH = path.join(SKILL_DIR, 'config.json');

const WRITE = process.argv.includes('--write');
const FORCE = process.argv.includes('--force');

const has = (p) => existsSync(path.join(REPO_ROOT, p));
const readJson = (p) => { try { return JSON.parse(readFileSync(path.join(REPO_ROOT, p), 'utf8')); } catch { return null; } };

const pkg = readJson('package.json');
const scripts = pkg?.scripts || {};
const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };

const facts = {
  packageJson: !!pkg,
  packageManager: has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : pkg ? 'npm' : null,
  workspace: has('pnpm-workspace.yaml') || !!pkg?.workspaces,
  typescript: !!deps.typescript || has('tsconfig.json'),
  tsProjectRefs: readJson('tsconfig.json')?.references?.length || 0,
  eslint: !!deps.eslint || has('.eslintrc') || has('.eslintrc.json') || has('.eslintrc.cjs') || has('eslint.config.js') || has('eslint.config.mjs'),
  biome: !!deps['@biomejs/biome'] || has('biome.json') || has('biome.jsonc'),
  python: has('requirements.txt') || has('pyproject.toml') || has('setup.py'),
  flake8: has('.flake8') || has('setup.cfg') || has('tox.ini'),
  mypy: has('.mypy_cache') || has('mypy.ini'),
  ruff: has('ruff.toml') || has('.ruff.toml'),
  ssssCli: has('node_modules/@ssss/cli'),
  ssssSkill: has('.agent/skills/ssss/SKILL.md'),
  ssssVault: has('vault'),
  vitest: !!deps.vitest,
  ssssScripts: Object.keys(scripts).filter((k) => k.startsWith('ssss')),
  qualityScripts: Object.keys(scripts).filter((k) => /^(lint|format|typecheck|check|validate|test)/.test(k))
};

console.log(`\n🔎 code-quality detect — ${REPO_ROOT}\n`);
for (const [k, v] of Object.entries(facts)) {
  const val = Array.isArray(v) ? (v.length ? v.join(', ') : '—') : v === true ? 'yes' : v === false ? 'no' : (v ?? '—');
  console.log(`  ${k.padEnd(18)} ${val}`);
}

// ─── Propose ──────────────────────────────────────────────────────────────────

const pm = facts.packageManager;
const run = (script) => (pm === 'pnpm' ? ['pnpm', 'run', script] : pm === 'yarn' ? ['yarn', script] : ['npm', 'run', script]);
const checks = [];

if (facts.typescript && scripts.typecheck) {
  checks.push({ id: 'types', tier: 'fast', cmd: run('typecheck'), parser: 'tsc' });
} else if (facts.typescript) {
  const tsc = facts.tsProjectRefs > 0 ? ['--build'] : ['--noEmit'];
  checks.push({ id: 'types', tier: 'fast', cmd: [pm === 'pnpm' ? 'pnpm' : 'npx', 'exec', 'tsc', ...tsc, '--pretty', 'false'].filter(Boolean), parser: 'tsc' });
}
if (facts.biome && scripts.lint) checks.push({ id: 'lint', tier: 'fast', cmd: run('lint'), parser: 'generic' });
else if (facts.eslint && scripts.lint) checks.push({ id: 'lint', tier: 'fast', cmd: run('lint'), parser: 'eslint-stylish' });
if (facts.flake8) checks.push({ id: 'flake8', tier: 'fast', cmd: ['python3', '-m', 'flake8', '.'], parser: 'flake8' });
if (facts.mypy) checks.push({ id: 'mypy', tier: 'fast', cmd: ['python3', '-m', 'mypy', '.'], parser: 'mypy' });
for (const s of facts.ssssScripts) {
  checks.push({ id: s.replace(/^ssss:/, 'ssss-'), tier: s.includes('validate') ? 'fast' : 'full', cmd: run(s), parser: 'generic' });
}
if (scripts.test) checks.push({ id: 'test', tier: 'full', cmd: run('test'), parser: 'generic' });

const proposed = {
  version: 3,
  toolchain: facts.python ? 'python' : facts.typescript ? 'typescript' : 'javascript',
  globalLock: true,
  memory: { maxOldSpaceMb: 4096 },
  lock: { staleAfterMinutes: 45 },
  sourceExtensions: facts.python ? ['.py'] : ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
  checks
};

console.log(`\n── proposed config.json (${checks.length} checks) ──`);
console.log(JSON.stringify(proposed, null, 2));

if (!WRITE) {
  console.log(`\nℹ️  Nothing written. Review, then: node ${path.basename(__filename)} --write`);
  console.log(`   Then TAILOR it by hand — add this repo's real gates (SSSS conformance,`);
  console.log(`   contract tests, grep gates for banned suppressions).`);
  process.exit(0);
}
if (existsSync(CONFIG_PATH) && !FORCE) {
  console.error(`\n❌ ${CONFIG_PATH} already exists. Use --force to overwrite (this discards hand-tailoring).`);
  process.exit(1);
}
writeFileSync(CONFIG_PATH, JSON.stringify(proposed, null, 2) + '\n');
console.log(`\n✅ Wrote ${CONFIG_PATH} — now tailor it by hand.`);
