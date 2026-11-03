#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

// 1. Code-quality & conformance gates (fail-closed)
const qualityGates = [
  ['node', ['scripts/validate-skills.mjs']],
  ['node', ['skills/ssss-registry-parity-auditor/scripts/run-parity-audit.mjs']],
  ['node', ['scripts/conformance.mjs', 'conformance', '--engine']],
  ['git', ['diff', '--check']],
];

console.log('--- Phase 1: Running Code Quality & Conformance Gates ---');
for (const [cmd, args] of qualityGates) {
  const label = [cmd, ...args].join(' ');
  try {
    execFileSync(cmd, args, { stdio: 'inherit' });
    console.log(`ok: ${label}`);
  } catch {
    console.error(`failed: ${label}`);
    process.exit(1);
  }
}

// 2. OpenWiki Refresh & Automatic Doc Sync (only runs after gates pass)
console.log('\n--- Phase 2: Refreshing OpenWiki & Syncing Documentation ---');
const docSteps = [
  ['total-recall', ['openwiki', 'refresh', '--repo', 'ssss', '--apply']],
  ['node', ['scripts/sync-docs.mjs']],
  ['node', ['scripts/check-docs-parity.mjs']],
];

for (const [cmd, args] of docSteps) {
  const label = [cmd, ...args].join(' ');
  try {
    execFileSync(cmd, args, { stdio: 'inherit' });
    console.log(`ok: ${label}`);
  } catch {
    console.error(`failed: ${label}`);
    process.exit(1);
  }
}

console.log('\n✓ Preflight complete: quality gates passed, openwiki refreshed, and documentation verified.');
