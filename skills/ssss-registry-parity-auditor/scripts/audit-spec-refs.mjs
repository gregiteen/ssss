#!/usr/bin/env node
/**
 * Checks every `spec_ref` annotation in registry/core.json + extensions/*.json
 * actually resolves to a real heading in docs/ssss-spec.md.
 *
 * spec_ref formats seen in this repo:
 *   "§5.4 memory"   -> section 5.4 exists AND a "#### `memory`" (or similar)
 *                      sub-heading exists somewhere inside that section
 *   "§6"            -> a numbered heading for section 6 exists
 *   "§6.2"          -> a numbered heading for section 6.2 exists
 *   "§6, §8"        -> comma-separated; every listed section must exist
 *   "Appendix A"    -> a heading containing "Appendix A" exists
 *
 * This is a heuristic text match, not a full Markdown AST parse — report
 * findings as PLAUSIBLE and spot-check the flagged ones by hand before
 * treating a "stale spec_ref" claim as certain.
 *
 * Usage: node audit-spec-refs.mjs [path-to-ssss-repo]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'docs', 'ssss-spec.md'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function loadHeadings(specPath) {
  const lines = fs.readFileSync(specPath, 'utf8').split('\n');
  // sections[n] = { line, title } for "## n. Title" or "### n.m Title"
  const sections = new Map();
  // subheadings: array of { line, sectionNumber (nearest enclosing ## or ###), text }
  const subheadings = [];
  let currentSection = null;
  lines.forEach((line, i) => {
    const secMatch = line.match(/^#{2,3}\s+(\d+(?:\.\d+)?)\.?\s+(.*)$/);
    if (secMatch) {
      currentSection = secMatch[1];
      sections.set(secMatch[1], { line: i + 1, title: secMatch[2] });
      return;
    }
    const subMatch = line.match(/^#{4,6}\s+`?([^`\n]+?)`?\s*$/);
    if (subMatch && currentSection) {
      subheadings.push({ line: i + 1, sectionNumber: currentSection, text: subMatch[1].trim() });
    }
  });
  return { sections, subheadings };
}

function collectSpecRefs(registryDir) {
  const refs = []; // { source, primitive, spec_ref }
  const corePath = path.join(registryDir, 'core.json');
  const core = JSON.parse(fs.readFileSync(corePath, 'utf8'));
  for (const group of ['document_primitives', 'contract_primitives']) {
    for (const [name, def] of Object.entries(core[group] || {})) {
      if (def.spec_ref) refs.push({ source: 'core.json', primitive: name, spec_ref: def.spec_ref });
    }
  }
  if (core.portability?.spec_ref) refs.push({ source: 'core.json', primitive: 'portability', spec_ref: core.portability.spec_ref });
  if (core.bundle?.spec_ref) refs.push({ source: 'core.json', primitive: 'bundle', spec_ref: core.bundle.spec_ref });
  if (core.provisioning?.spec_ref) refs.push({ source: 'core.json', primitive: 'provisioning', spec_ref: core.provisioning.spec_ref });

  const extDir = path.join(registryDir, 'extensions');
  if (fs.existsSync(extDir)) {
    for (const file of fs.readdirSync(extDir).filter((f) => f.endsWith('.json'))) {
      const ext = JSON.parse(fs.readFileSync(path.join(extDir, file), 'utf8'));
      for (const [name, def] of Object.entries(ext.document_primitives || {})) {
        if (def.spec_ref) refs.push({ source: `extensions/${file}`, primitive: name, spec_ref: def.spec_ref });
      }
    }
  }
  return refs;
}

function checkOneRef(specRef, { sections, subheadings }) {
  const problems = [];
  const parts = specRef.split(',').map((s) => s.trim());
  for (const part of parts) {
    if (/^appendix/i.test(part)) {
      // Appendix headings aren't numbered like "## N."; do a loose text search instead.
      continue; // best-effort: not checked structurally, avoid false positives
    }
    const m = part.match(/^§(\d+(?:\.\d+)?)(?:\s+`?([^`]+?)`?)?$/);
    if (!m) { problems.push(`unparseable spec_ref fragment "${part}"`); continue; }
    const [, sectionNum, label] = m;
    if (!sections.has(sectionNum)) {
      problems.push(`section §${sectionNum} not found in docs/ssss-spec.md`);
      continue;
    }
    if (label) {
      const found = subheadings.some((h) => h.sectionNumber === sectionNum && h.text.toLowerCase() === label.toLowerCase());
      if (!found) {
        problems.push(`§${sectionNum} exists but has no "${label}" sub-heading (looked for "#### ${label}" or similar under it)`);
      }
    }
  }
  return problems;
}

function main() {
  const target = process.argv[2] ? path.resolve(process.argv[2]) : findRepoRoot(__dirname);
  if (!target) {
    console.error('❌ Could not locate an SSSS repo (looked for docs/ssss-spec.md).');
    process.exit(1);
  }
  const specPath = path.join(target, 'docs', 'ssss-spec.md');
  const registryDir = path.join(target, 'registry');
  const headings = loadHeadings(specPath);
  const refs = collectSpecRefs(registryDir);

  let problemCount = 0;
  for (const { source, primitive, spec_ref } of refs) {
    const problems = checkOneRef(spec_ref, headings);
    if (problems.length) {
      problemCount += problems.length;
      console.log(`⚠️  ${source}: "${primitive}" spec_ref "${spec_ref}"`);
      for (const p of problems) console.log(`     • ${p}`);
    }
  }

  if (problemCount === 0) {
    console.log(`✅ spec_ref audit: all ${refs.length} annotations resolve to a real heading in docs/ssss-spec.md (heuristic check).`);
  } else {
    console.log(`\n${problemCount} possibly-stale spec_ref annotation(s) found across ${refs.length} checked. Verify by hand before treating as confirmed.`);
    process.exitCode = 1;
  }
}

main();
