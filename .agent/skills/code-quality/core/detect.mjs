#!/usr/bin/env node
/**
 * code-quality / core/detect.mjs — probe a repo and propose a repo config.
 *
 * A bootstrap, not the source of truth. It reports what the repo actually has;
 * the repo's real gate list (conformance suites, contract tests, grep gates for
 * its own invariants) is repo knowledge added afterwards through the CLI:
 *
 *   total-recall skill config code-quality detect            # show the proposal
 *   total-recall skill config code-quality detect --apply    # record it
 *   total-recall skill config code-quality gate add id=… tier=fast cmd='["npm","test"]'
 *
 * Run directly (`node detect.mjs`) it only prints facts and the proposal.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function detectFacts(repoRoot) {
  const has = (p) => existsSync(path.join(repoRoot, p));
  const readText = (p) => { try { return readFileSync(path.join(repoRoot, p), 'utf8'); } catch { return ''; } };
  const readJson = (p) => { try { return JSON.parse(readText(p)); } catch { return null; } };
  const pkg = readJson('package.json');
  const scripts = pkg?.scripts || {};
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  return {
    scripts,
    packageJson: !!pkg,
    packageManager: has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : pkg ? 'npm' : null,
    workspace: has('pnpm-workspace.yaml') || !!pkg?.workspaces,
    typescript: !!deps.typescript || has('tsconfig.json'),
    tsProjectRefs: readJson('tsconfig.json')?.references?.length || 0,
    eslint: !!deps.eslint || ['.eslintrc', '.eslintrc.json', '.eslintrc.cjs', 'eslint.config.js', 'eslint.config.mjs'].some(has),
    biome: !!deps['@biomejs/biome'] || has('biome.json') || has('biome.jsonc'),
    python: has('requirements.txt') || has('pyproject.toml') || has('setup.py'),
    venvPython: has('.venv/bin/python'),
    flake8: has('.flake8') || has('setup.cfg') || has('tox.ini'),
    mypy: has('mypy.ini') || has('.mypy_cache'),
    black: /\[tool\.black\]/.test(readText('pyproject.toml')),
    ssssScripts: Object.keys(scripts).filter((k) => k.startsWith('ssss')),
  };
}

/** Propose a config satisfying core/config.schema.json. */
export function detect({ repoRoot }) {
  const facts = detectFacts(repoRoot);
  const { scripts, packageManager: pm } = facts;
  const run = (script) => (pm === 'pnpm' ? ['pnpm', 'run', script] : pm === 'yarn' ? ['yarn', script] : ['npm', 'run', script]);
  const python = facts.venvPython ? '.venv/bin/python' : 'python3';
  const checks = [];

  if (facts.typescript && scripts.typecheck) {
    checks.push({ id: 'types', tier: 'fast', cmd: run('typecheck'), parser: 'tsc' });
  } else if (facts.typescript) {
    checks.push({ id: 'types', tier: 'fast', cmd: ['npx', 'tsc', facts.tsProjectRefs > 0 ? '--build' : '--noEmit', '--pretty', 'false'], parser: 'tsc' });
  }
  if (facts.biome && scripts.lint) checks.push({ id: 'lint', tier: 'fast', cmd: run('lint'), parser: 'generic' });
  else if (facts.eslint && scripts.lint) checks.push({ id: 'lint', tier: 'fast', cmd: run('lint'), parser: 'eslint-stylish' });
  if (facts.flake8) checks.push({ id: 'flake8', tier: 'fast', cmd: [python, '-m', 'flake8', '.'], parser: 'flake8' });
  if (facts.black) checks.push({ id: 'black-check', tier: 'fast', cmd: [python, '-m', 'black', '--check', '.'], parser: 'black' });
  if (facts.mypy) checks.push({ id: 'mypy', tier: 'fast', cmd: [python, '-m', 'mypy', '.'], parser: 'mypy' });
  for (const s of facts.ssssScripts) {
    checks.push({ id: s.replace(/^ssss:/, 'ssss-').replace(/[^a-z0-9-]/g, '-'), tier: s.includes('validate') ? 'fast' : 'full', cmd: run(s), parser: 'generic' });
  }
  if (scripts.test) checks.push({ id: 'test', tier: 'full', cmd: run('test'), parser: 'generic' });

  return {
    version: 3,
    toolchain: facts.python && !facts.typescript ? 'python' : facts.typescript ? 'typescript' : 'javascript',
    globalLock: true,
    lock: { staleAfterMinutes: 45 },
    sourceExtensions: facts.python ? ['.py'] : ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    checks,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
  const { scripts, ...facts } = detectFacts(repoRoot);
  console.log(`\n🔎 code-quality detect — ${repoRoot}\n`);
  for (const [k, v] of Object.entries(facts)) {
    const val = Array.isArray(v) ? (v.length ? v.join(', ') : '—') : v === true ? 'yes' : v === false ? 'no' : (v ?? '—');
    console.log(`  ${k.padEnd(16)} ${val}`);
  }
  console.log('\n── proposed config ──');
  console.log(JSON.stringify(detect({ repoRoot }), null, 2));
  console.log('\nNothing written. Record it with: total-recall skill config code-quality detect --apply');
}
