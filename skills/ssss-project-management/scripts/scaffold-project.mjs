#!/usr/bin/env node
/**
 * Scaffold the 4 canonical SSSS project documents (PRD, Architecture, Dev Plan,
 * Tracker) for a new PROJECT_PREFIX, per the ssss-project-management skill's
 * Standard SWE Sequence.
 *
 * Usage:
 *   node scaffold-project.mjs <PROJECT_PREFIX> [--stage planned|in-progress|completed] [--force]
 *
 * Run from anywhere inside the target repo — it walks up to find the repo root
 * (the nearest ancestor containing docs/projects/ or package.json).
 */
import fs from 'node:fs';
import path from 'node:path';

function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 20; i++) {
    if (fs.existsSync(path.join(dir, 'docs', 'projects')) || fs.existsSync(path.join(dir, '.git'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not find repo root (no docs/projects/ or .git ancestor found).');
}

function parseArgs(argv) {
  const args = { stage: 'planned', force: false, prefix: null };
  for (const a of argv) {
    if (a === '--force') args.force = true;
    else if (a.startsWith('--stage=')) args.stage = a.slice('--stage='.length);
    else if (a === '--stage') args._wantStage = true;
    else if (args._wantStage) { args.stage = a; args._wantStage = false; }
    else if (!args.prefix) args.prefix = a;
  }
  return args;
}

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

const VALID_STAGES = ['planned', 'in-progress', 'completed'];
const PREFIX_RE = /^[A-Z][A-Z0-9_]*[A-Z0-9]$/;

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function header(prefix, docType, kanbanState) {
  return `---
type: project_document
title: ${prefix} — ${docType}
tags: ["project-management", "${prefix}"]
timestamp: ${nowIso()}
---

# ${prefix} — ${docType}

> **Project Prefix**: \`${prefix}\`
> **Kanban State**: ${kanbanState}
> **Author**: <Author>
> **Date**: ${nowIso().slice(0, 10)}

---
`;
}

const DOC_TYPES = [
  { suffix: 'PRD', title: 'Product Requirements', body: (p) => `## Problem\n\n<What problem does ${p} solve, and for whom?>\n\n## Scope\n\n<In scope / out of scope.>\n\n## Requirements\n\n<Numbered, testable requirements.>\n` },
  { suffix: 'ARCHITECTURE', title: 'Architecture', body: () => `## Design\n\n<Schema, API, component structure.>\n\n## Tradeoffs\n\n<Alternatives considered and why this one won.>\n` },
  { suffix: 'DEVELOPMENT_PLAN', title: 'Development Plan', body: () => `## Phases\n\n1. <Phase 1>\n2. <Phase 2>\n` },
  { suffix: 'PROJECT_TRACKER', title: 'Project Tracker', body: (p) => `## Tasks\n\n- [ ] <first task for ${p}>\n\n## Verification Log\n\n<Entries added as work completes.>\n` },
];

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.prefix) die('usage: scaffold-project.mjs <PROJECT_PREFIX> [--stage planned|in-progress|completed] [--force]');
  if (!VALID_STAGES.includes(args.stage)) die(`--stage must be one of: ${VALID_STAGES.join(', ')}`);
  if (!PREFIX_RE.test(args.prefix)) {
    die(`PROJECT_PREFIX "${args.prefix}" must be SCREAMING_SNAKE_CASE (e.g. MY_NEW_FEATURE).`);
  }

  const root = findRepoRoot(process.cwd());
  const projectsDir = path.join(root, 'docs', 'projects');

  // Refuse if the prefix already exists in ANY lifecycle stage — prefixes are unique repo-wide.
  for (const stage of VALID_STAGES) {
    const existing = path.join(projectsDir, stage, args.prefix);
    if (fs.existsSync(existing) && !args.force) {
      die(`${args.prefix} already exists at docs/projects/${stage}/${args.prefix}/ — prefixes must be unique. Use --force to scaffold anyway (existing files won't be overwritten).`);
    }
  }

  const kanbanState = { planned: '📋 Planned', 'in-progress': '🏗️ In Progress', completed: '✅ Completed' }[args.stage];
  const target = path.join(projectsDir, args.stage, args.prefix);
  fs.mkdirSync(target, { recursive: true });

  let written = 0;
  for (const doc of DOC_TYPES) {
    const file = path.join(target, `${args.prefix}_${doc.suffix}.md`);
    if (fs.existsSync(file) && !args.force) {
      console.error(`skip (exists): ${path.relative(root, file)}`);
      continue;
    }
    fs.writeFileSync(file, header(args.prefix, doc.title, kanbanState) + '\n' + doc.body(args.prefix));
    console.error(`wrote: ${path.relative(root, file)}`);
    written++;
  }

  if (written === 0) die('nothing written — all 4 documents already exist. Use --force to refill missing ones.');
  console.error(`\n${args.prefix} scaffolded under docs/projects/${args.stage}/${args.prefix}/ (${written}/4 documents written).`);
}

main();
