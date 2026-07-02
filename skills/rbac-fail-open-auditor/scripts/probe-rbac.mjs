#!/usr/bin/env node
/**
 * Runs the adversarial Stage 5.5 (RBAC) envelope matrix from
 * enumerate-envelopes.mjs against the target repo's reference engine, on a
 * fresh disposable temp vault per scenario, and classifies every step as:
 *
 *   PASS        — actual result matched expectedAllowed
 *   FAIL-OPEN   — expectedAllowed=false but the engine allowed it (a real
 *                 security finding)
 *   FAIL-CLOSED-UNEXPECTED — expectedAllowed=true but the engine denied it
 *                 (a usability/correctness bug, not a security hole, but
 *                 still worth reporting — e.g. a legitimately-scoped role
 *                 getting incorrectly denied)
 *
 * Usage: node probe-rbac.mjs [path-to-ssss-repo]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildScenarios } from './enumerate-envelopes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'src', 'engine.mjs'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

async function main() {
  const target = process.argv[2] ? path.resolve(process.argv[2]) : findRepoRoot(__dirname);
  if (!target) {
    console.error('❌ Could not locate an SSSS repo (looked for src/engine.mjs).');
    process.exit(1);
  }
  const enginePath = path.join(target, 'src', 'engine.mjs');
  const { createEngine } = await import(pathToFileURL(enginePath).href);

  const scenarios = buildScenarios();
  const findings = { failOpen: [], failClosedUnexpected: [], pass: 0 };

  for (const scenario of scenarios) {
    const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'rbac-audit-'));
    const engine = createEngine();
    try {
      for (const step of scenario.steps) {
        const res = engine.processOperation(step.envelope, vault);
        const actualAllowed = !!res.success;
        if (actualAllowed === step.expectedAllowed) {
          findings.pass++;
        } else if (step.expectedAllowed === false && actualAllowed === true) {
          findings.failOpen.push({ scenario: scenario.name, note: scenario.note, step: step.label, envelope: step.envelope, response: res });
        } else {
          findings.failClosedUnexpected.push({ scenario: scenario.name, note: scenario.note, step: step.label, envelope: step.envelope, response: res });
        }
      }
    } finally {
      fs.rmSync(vault, { recursive: true, force: true });
    }
  }

  console.log(`\n=== RBAC adversarial probe: ${scenarios.reduce((n, s) => n + s.steps.length, 0)} steps across ${scenarios.length} scenarios ===\n`);
  console.log(`  ✅ ${findings.pass} matched expectation`);

  if (findings.failOpen.length) {
    console.log(`\n  🚨 ${findings.failOpen.length} FAIL-OPEN finding(s) — these are real security gaps:`);
    for (const f of findings.failOpen) {
      console.log(`     • [${f.scenario}] ${f.step}`);
      console.log(`       ${f.note}`);
      console.log(`       envelope: ${JSON.stringify(f.envelope)}`);
      console.log(`       engine allowed it: success=${f.response.success}`);
    }
  } else {
    console.log('\n  ✅ 0 fail-open findings.');
  }

  if (findings.failClosedUnexpected.length) {
    console.log(`\n  ⚠️  ${findings.failClosedUnexpected.length} unexpectedly-denied case(s) — correctness/usability bugs, not security holes:`);
    for (const f of findings.failClosedUnexpected) {
      console.log(`     • [${f.scenario}] ${f.step}`);
      console.log(`       envelope: ${JSON.stringify(f.envelope)}`);
      console.log(`       engine denied it: errors=${JSON.stringify(f.response.validation?.errors)}`);
    }
  }

  console.log();
  if (findings.failOpen.length > 0) {
    process.exitCode = 1;
  }

  // Emit machine-readable findings for emit-negative-fixtures.mjs to consume.
  const outPath = path.join(os.tmpdir(), 'rbac-audit-findings.json');
  fs.writeFileSync(outPath, JSON.stringify(findings, null, 2));
  console.log(`(findings written to ${outPath} for emit-negative-fixtures.mjs)`);
}

main();
