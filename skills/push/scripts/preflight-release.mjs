#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const checks = [
  ['node', ['scripts/validate-skills.mjs']],
  ['node', ['skills/ssss-registry-parity-auditor/scripts/run-parity-audit.mjs']],
  ['node', ['scripts/conformance.mjs', 'conformance', '--engine']],
  ['git', ['diff', '--check']],
];

let failed = false;
for (const [cmd, args] of checks) {
  const label = [cmd, ...args].join(' ');
  try {
    execFileSync(cmd, args, { stdio: 'inherit' });
    console.log(`ok: ${label}`);
  } catch {
    console.error(`failed: ${label}`);
    failed = true;
  }
}

if (failed) process.exit(1);
