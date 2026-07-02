#!/usr/bin/env node
/**
 * Thin wrapper around the repo's own automatic parity gate
 * (scripts/audit-registry-field-usage.mjs, wired into `npm test`). This skill
 * does not reimplement that check — the whole point is one implementation,
 * not a skill-side fork that can drift from the CI-enforced version.
 *
 * Usage: node run-parity-audit.mjs [path-to-ssss-repo]
 * Defaults to the repo this skill lives in (walks up from .agent/skills/...).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'scripts', 'audit-registry-field-usage.mjs'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

async function main() {
  const target = process.argv[2] ? path.resolve(process.argv[2]) : findRepoRoot(__dirname);
  if (!target) {
    console.error('❌ Could not locate an SSSS repo (looked for scripts/audit-registry-field-usage.mjs).');
    console.error('   Pass the repo path explicitly: node run-parity-audit.mjs /path/to/ssss');
    process.exit(1);
  }
  const auditScript = path.join(target, 'scripts', 'audit-registry-field-usage.mjs');
  if (!fs.existsSync(auditScript)) {
    console.error(`❌ ${auditScript} not found — this skill requires the audit script to exist in the target repo.`);
    process.exit(1);
  }
  const { auditRegistryFieldUsage } = await import(pathToFileURL(auditScript).href);
  const problems = auditRegistryFieldUsage();
  if (problems.length) {
    console.log(`❌ Registry/engine parity audit FAILED (${problems.length} problem(s)):`);
    for (const p of problems) console.log(`   • ${p}`);
    process.exitCode = 1;
  } else {
    console.log('✅ Registry/engine parity: clean. Every enforcement-relevant registry key is referenced by the engine.');
  }
}

main();
