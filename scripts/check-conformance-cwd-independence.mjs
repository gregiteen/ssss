#!/usr/bin/env node
// Regression guard for the `ssss conformance --engine` cwd bug.
//
// checkJsonSchemas() used to resolve registry/, schemas/ and conformance/ from
// process.cwd(). Those assets ship inside this package, and consumers run the
// gate from their own project root — often with the registry at a different
// path entirely (e.g. --registry vault-registry). The result was an ENOENT
// crash in every downstream repository, which looked like a consumer
// misconfiguration rather than a packaging defect.
//
// This check runs the real conformance gate from a directory that contains
// none of those assets, so a cwd-relative regression fails here instead of in
// somebody else's repository.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const check = (name, passed, detail = '') => checks.push({ name, passed: !!passed, detail });

const foreign = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-cwd-'));
try {
  // The assets the gate needs must NOT be reachable from here.
  for (const dir of ['registry', 'schemas', 'conformance', 'src', 'scripts']) {
    check(`consumer cwd has no ${dir}/ of its own`, !fs.existsSync(path.join(foreign, dir)));
  }

  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'conformance-09.mjs'), 'utf8');
  check('conformance-09 resolves package assets from the module, not cwd',
    !/path\.resolve\(\s*['"](registry|schemas|conformance)\//.test(source),
    'found a path.resolve() on a package asset path');

  let stdout = '';
  let exitCode = 0;
  try {
    stdout = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'conformance.mjs'), 'conformance', '--engine'], {
      cwd: foreign,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    exitCode = error.status ?? 1;
    stdout = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }

  check('conformance --engine exits 0 from a foreign cwd', exitCode === 0, `exit ${exitCode}`);
  check('no ENOENT for a package asset', !/ENOENT/.test(stdout),
    (stdout.match(/ENOENT[^\n]*/) ?? [''])[0]);
  check('schema: registry/core.json check ran and passed',
    /✅ schema: registry\/core\.json validates/.test(stdout));
  check('schema: reference-bundle check ran and passed',
    /✅ schema: reference-bundle\.ucw\.json validates/.test(stdout));
  check('no conformance check failed', !/❌/.test(stdout),
    (stdout.match(/❌[^\n]*/) ?? [''])[0]);
} finally {
  fs.rmSync(foreign, { recursive: true, force: true });
}

let passed = 0;
for (const item of checks) {
  if (item.passed) { passed++; console.log(`  ✅ ${item.name}`); }
  else console.log(`  ❌ ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
}
console.log(`\n  ${passed}/${checks.length} conformance cwd-independence checks passed`);
if (passed !== checks.length) process.exitCode = 1;
