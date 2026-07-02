#!/usr/bin/env node
/**
 * Parses conformance/README.md's "Open reconciliation items" table and flags
 * rows whose stated status looks stale against the CURRENT spec content.
 *
 * Generic prose resolutions can't be verified automatically — this script
 * only confirms the one concrete, checkable pattern that recurs in this
 * table's history: "Amend §X.Y to add error code(s) N[, M...]". For any row
 * matching that pattern, it checks whether docs/ssss-spec.md's error-code
 * table (§6.5) already lists every named code; if so and the row isn't
 * marked ✅, the table is stale and should be updated.
 *
 * All other rows are reported as-is (resolved vs. open) for a human/agent to
 * review — this script does not claim to auto-verify free-form prose.
 *
 * Usage: node diff-reconciliation-table.mjs [path-to-ssss-repo]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'conformance', 'README.md'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function parseTable(readmeContent) {
  const lines = readmeContent.split('\n');
  const rows = [];
  let inTable = false;
  for (const line of lines) {
    if (/^\|\s*#\s*\|\s*Item\s*\|/.test(line)) { inTable = true; continue; }
    if (inTable && /^\|[-\s|]+\|$/.test(line)) continue; // separator row
    if (inTable && line.trim().startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.length >= 5) rows.push({ num: cells[0], item: cells[1], specSays: cells[2], implDoes: cells[3], resolution: cells[4] });
      continue;
    }
    if (inTable && !line.trim().startsWith('|')) break; // table ended
  }
  return rows;
}

function extractErrorCodesFromSpec(specContent) {
  // §6.5's error-code table rows look like: | `400` | ... |
  const codes = new Set();
  for (const m of specContent.matchAll(/\|\s*`(\d{3})`\s*\|/g)) codes.add(m[1]);
  return codes;
}

function main() {
  const target = process.argv[2] ? path.resolve(process.argv[2]) : findRepoRoot(__dirname);
  if (!target) {
    console.error('❌ Could not locate an SSSS repo (looked for conformance/README.md).');
    process.exit(1);
  }
  const readmeContent = fs.readFileSync(path.join(target, 'conformance', 'README.md'), 'utf8');
  const specContent = fs.readFileSync(path.join(target, 'docs', 'ssss-spec.md'), 'utf8');
  const rows = parseTable(readmeContent);
  const specErrorCodes = extractErrorCodesFromSpec(specContent);

  let stale = 0;
  for (const row of rows) {
    const isMarkedResolved = /✅/.test(row.resolution);
    const codeAmend = row.resolution.match(/add\s+(?:`?\d{3}`?(?:\s*(?:and|,)\s*)?)+/i);
    if (codeAmend) {
      const wantedCodes = [...row.resolution.matchAll(/`?(\d{3})`?/g)].map((m) => m[1]);
      const allPresent = wantedCodes.length > 0 && wantedCodes.every((c) => specErrorCodes.has(c));
      if (allPresent && !isMarkedResolved) {
        stale++;
        console.log(`⚠️  Row #${row.num} "${row.item}": proposed resolution wants error code(s) ${wantedCodes.join(', ')} — spec §6.5 already lists all of them, but the row isn't marked ✅. Table is stale; mark resolved.`);
        continue;
      }
      if (!allPresent && isMarkedResolved) {
        stale++;
        console.log(`⚠️  Row #${row.num} "${row.item}": marked ✅ resolved but spec §6.5 is MISSING code(s) ${wantedCodes.filter((c) => !specErrorCodes.has(c)).join(', ')}.`);
        continue;
      }
    }
    console.log(`${isMarkedResolved ? '✅' : '⬜'} Row #${row.num}: ${row.item} — ${isMarkedResolved ? 'marked resolved' : 'open (resolution: ' + row.resolution.slice(0, 80) + (row.resolution.length > 80 ? '…' : '') + ')'}`);
  }

  if (stale > 0) {
    console.log(`\n${stale} row(s) look stale against current spec content — see ⚠️ lines above.`);
    process.exitCode = 1;
  } else {
    console.log(`\n✅ No stale rows detected by the checkable heuristic (${rows.length} rows total; free-form prose resolutions still need human review).`);
  }
}

main();
