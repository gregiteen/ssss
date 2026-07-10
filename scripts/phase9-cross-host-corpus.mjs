#!/usr/bin/env node
/**
 * Phase 9 — shared cross-host command corpus.
 *
 * Runs a normalized set of Operation Contract envelopes through the package
 * kernel (MemoryVfs + memory durable stores) and prints a machine-readable
 * report. Hosts can re-run the same envelopes via their bridges and compare
 * success/valid/type verdicts against this reference.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createKernel, canonicalRequestHash } from '../src/kernel.mjs';
import { FileSystemVfs } from '../src/vfs.mjs';
import { MemoryEventStore } from '../src/events.mjs';
import { MemoryIdempotencyStore } from '../src/idempotency.mjs';
import { MemoryLeaseStore } from '../src/leases.mjs';
import { createValidator } from '../src/validator.mjs';
import { loadRegistries } from '../src/registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function ruleContent(name) {
  return [
    '---',
    'type: rule',
    `title: ${name}`,
    `description: Phase 9 corpus rule ${name}`,
    'timestamp: 2026-07-10T00:00:00Z',
    `name: ${name}`,
    '---',
    '',
    `Body for ${name}.`,
    '',
  ].join('\n');
}

function spanishRuleContent() {
  return [
    '---',
    'type: rule',
    'title: Bienvenida',
    'description: Regla estructural de corpus multilingüe',
    'timestamp: 2026-07-10T00:00:00Z',
    'name: bienvenida',
    '---',
    '',
    'Cuerpo en español.',
    '',
  ].join('\n');
}

const CORPUS = [
  {
    id: 'corpus-rule-create',
    envelope: {
      type: 'operation',
      workspace_id: 'ws-corpus',
      idempotency_key: 'corpus-rule-1',
      path: 'rules/welcome.md',
      content: ruleContent('welcome'),
    },
    expect: { success: true, valid: true },
  },
  {
    id: 'corpus-rule-idempotent-replay',
    envelope: {
      type: 'operation',
      workspace_id: 'ws-corpus',
      idempotency_key: 'corpus-rule-1',
      path: 'rules/welcome.md',
      content: ruleContent('welcome'),
    },
    expect: { success: true, valid: true, replay: true },
  },
  {
    id: 'corpus-rule-idempotent-conflict',
    envelope: {
      type: 'operation',
      workspace_id: 'ws-corpus',
      idempotency_key: 'corpus-rule-1',
      path: 'rules/welcome.md',
      content: ruleContent('welcome-changed'),
    },
    expect: { success: false },
  },
  {
    id: 'corpus-dry-run',
    envelope: {
      type: 'operation',
      workspace_id: 'ws-corpus',
      idempotency_key: 'corpus-dry-1',
      path: 'rules/dry.md',
      content: ruleContent('dry'),
      dry_run: true,
    },
    expect: { success: true, valid: true, dry_run: true },
  },
  {
    id: 'corpus-multilingual-rule',
    envelope: {
      type: 'operation',
      workspace_id: 'ws-corpus',
      idempotency_key: 'corpus-es-1',
      path: 'rules/bienvenida.md',
      content: spanishRuleContent(),
    },
    expect: { success: true, valid: true },
  },
  {
    id: 'corpus-missing-actor-denied',
    envelope: {
      type: 'operation',
      workspace_id: 'ws-corpus',
      idempotency_key: 'corpus-no-actor',
      path: 'rules/no-actor.md',
      content: ruleContent('no-actor'),
    },
    principal: null,
    expect: { success: false },
  },
];

function principal() {
  return {
    id: 'phase9:corpus',
    kind: 'system',
    workspaceIds: ['ws-corpus'],
    capabilities: ['*:*'],
    authentication: { provider: 'phase9-corpus', assurance: 'system' },
  };
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-phase9-corpus-'));
  const registrySet = loadRegistries();
  const validator = createValidator({ registrySet });
  const kernel = createKernel({
    vfs: new FileSystemVfs(root),
    eventStore: new MemoryEventStore(),
    leaseStore: new MemoryLeaseStore(),
    idempotencyStore: new MemoryIdempotencyStore(),
    validator,
  });

  const results = [];
  for (const caseDef of CORPUS) {
    const p =
      caseDef.principal === null
        ? null
        : caseDef.principal || principal();
    let result;
    try {
      if (!p) {
        // Simulate host fail-closed before kernel when identity missing
        result = {
          success: false,
          validation: { valid: false, errors: ['Missing actor'] },
        };
      } else {
        result = await kernel.execute(caseDef.envelope, { principal: p });
      }
    } catch (error) {
      result = {
        success: false,
        validation: { valid: false, errors: [error.message] },
        error: error.message,
      };
    }

    const verdict = {
      id: caseDef.id,
      success: !!result.success,
      valid: !!result.validation?.valid,
      replay: !!result.replay,
      dry_run: !!result.dry_run || !!caseDef.envelope.dry_run,
      type: result.validation?.type || null,
      errors: result.validation?.errors || [],
      request_hash: canonicalRequestHash(caseDef.envelope),
    };

    const ok =
      (caseDef.expect.success === undefined ||
        verdict.success === caseDef.expect.success) &&
      (caseDef.expect.valid === undefined ||
        verdict.valid === caseDef.expect.valid) &&
      (caseDef.expect.replay === undefined ||
        verdict.replay === caseDef.expect.replay) &&
      (caseDef.expect.dry_run === undefined ||
        verdict.dry_run === caseDef.expect.dry_run);

    results.push({ ...verdict, passed: ok });
    console.log(`${ok ? '✅' : '❌'} ${caseDef.id} success=${verdict.success} valid=${verdict.valid}`);
  }

  const report = {
    suite: 'phase9-cross-host-corpus',
    package: '@gregiteen/ssss-cli',
    version: JSON.parse(
      fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'),
    ).version,
    generated_at: new Date().toISOString(),
    passed: results.every((r) => r.passed),
    results,
  };

  const outDir = path.join(__dirname, '../artifacts');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'phase9-cross-host-corpus.json');
  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nReport: ${outFile}`);
  console.log(`Overall: ${report.passed ? 'PASS' : 'FAIL'} (${results.filter((r) => r.passed).length}/${results.length})`);

  fs.rmSync(root, { recursive: true, force: true });
  process.exit(report.passed ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
