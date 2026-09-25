#!/usr/bin/env node
/**
 * Spec/implementation parity audit: proves docs/ssss-spec.md agrees with the
 * reference implementation on the things a second implementer copies.
 *
 * Motivation: through 0.9.3 every example document in the spec failed the
 * reference validator. The spec made `title`, `description`, and `timestamp`
 * universally required, and none of its examples carried all three. The
 * registry-parity audit could not see this, because it compares the registry
 * with the engine, never the spec with either.
 *
 * Checks, all deterministic:
 *   1. Every ```markdown example that opens with frontmatter validates.
 *   2. Every core document primitive has at least one valid example.
 *   3. §5.1 lists every core document primitive with its registry portability.
 *   4. The §6.5 error table matches src/http.mjs ERROR_STATUS exactly.
 *   5. The spec header version equals registry/core.json spec_version.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createValidator } from '../src/validator.mjs';
import { ERROR_STATUS } from '../src/http.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export function auditSpecExamples(options = {}) {
  const spec = options.spec ?? fs.readFileSync(path.join(ROOT, 'docs', 'ssss-spec.md'), 'utf8');
  const validator = createValidator();
  const core = validator.registry.core;
  const problems = [];

  const covered = new Set();
  for (const match of spec.matchAll(/```markdown\n([\s\S]*?)```/g)) {
    const content = match[1];
    if (!content.startsWith('---\n')) continue;
    const line = spec.slice(0, match.index).split('\n').length;
    const result = validator.validateDocument(content);
    if (result.valid) covered.add(result.declared_type);
    else problems.push(`spec line ${line}: '${result.declared_type || '(no type)'}' example is invalid — ${result.errors.join('; ')}`);
  }
  for (const type of Object.keys(core.document_primitives)) {
    if (!covered.has(type)) problems.push(`core primitive '${type}' has no valid example in the spec`);
  }

  for (const [type, definition] of Object.entries(core.document_primitives)) {
    const row = spec.match(new RegExp(`^\\| \`${type}\` \\| [^|]+\\| ([a-z_]+) \\|`, 'm'));
    if (!row) problems.push(`§5.1 table does not list core primitive '${type}'`);
    else if (row[1] !== definition.portability) {
      problems.push(`§5.1 lists '${type}' as ${row[1]}; registry says ${definition.portability}`);
    }
  }

  const table = new Map([...spec.matchAll(/^\| `([a-z_]+)` \| (\d{3}) \|/gm)].map((m) => [m[1], Number(m[2])]));
  for (const [code, status] of Object.entries(ERROR_STATUS)) {
    if (!table.has(code)) problems.push(`§6.5 error table is missing code '${code}'`);
    else if (table.get(code) !== status) problems.push(`§6.5 maps '${code}' to ${table.get(code)}; src/http.mjs maps it to ${status}`);
  }
  for (const code of table.keys()) {
    if (!(code in ERROR_STATUS)) problems.push(`§6.5 error table lists '${code}', which src/http.mjs does not define`);
  }

  const version = spec.match(/^\*\*Specification v([0-9.]+)\*\*/m)?.[1];
  if (version !== core.spec_version) problems.push(`spec header says v${version}; registry spec_version is ${core.spec_version}`);

  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = auditSpecExamples();
  if (problems.length) {
    console.error('❌ Spec/implementation parity audit failed:');
    for (const problem of problems) console.error(`   • ${problem}`);
    process.exitCode = 1;
  } else {
    console.log('✅ Spec parity: every spec example validates and the spec tables match the registry and error codes.');
  }
}
