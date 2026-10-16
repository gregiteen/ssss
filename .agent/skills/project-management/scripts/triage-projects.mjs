#!/usr/bin/env node
/**
 * triage-projects.mjs
 *
 * Scans all in-progress project folders. For each:
 *   - Reports archival candidates only after local document evidence checks
 *   - If tracker has unchecked items → show next task
 *   - If no tracker found → flag as untracked
 *
 * Usage:
 *   node .agents/skills/project-management/scripts/triage-projects.mjs          # report only (safe, NO changes)
 *   node .agents/skills/project-management/scripts/triage-projects.mjs --move   # shows list, requires typing YES
 *   node .agents/skills/project-management/scripts/triage-projects.mjs --json   # machine-readable report
 *
 * SAFETY: --move ALWAYS shows what will be moved and requires the user to type YES before any folder is touched.
 *         Agents must show the report to the user and get explicit approval before running --move.
 */

import { readFileSync, readdirSync, statSync, mkdirSync, renameSync, existsSync, createReadStream } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

const args = process.argv.slice(2);
const doMove = args.includes('--move');
const jsonMode = args.includes('--json');

const ROOT = process.cwd();
const IN_PROGRESS = join(ROOT, 'docs/projects/in-progress');
const COMPLETED = join(ROOT, 'docs/projects/completed');

function findTracker(projectDir) {
  try {
    const files = readdirSync(projectDir);
    return files.find(f => f.endsWith('_PROJECT_TRACKER.md') || f === 'PROJECT_TRACKER.md') || null;
  } catch { return null; }
}

function analyzeTracker(trackerPath) {
  try {
    const content = readFileSync(trackerPath, 'utf8');
    const lines = content.split('\n');
    const unchecked = lines.filter(l => l.match(/^\s*-\s*\[(?:\s*|\/)\]\s+/));
    const checked = lines.filter(l => l.match(/^\s*-\s*\[x\]\s+/i));
    const nextTask = unchecked[0]?.replace(/^\s*-\s*\[(?:\s*|\/)\]\s+/, '').trim() || null;

    let currentPhase = null;
    for (const line of lines) {
      if (line.match(/^#+\s/)) currentPhase = line.replace(/^#+\s/, '').trim();
      if (line === unchecked[0]) break;
    }

    return { unchecked: unchecked.length, checked: checked.length, nextTask, currentPhase, content };
  } catch {
    return { unchecked: 1, checked: 0, nextTask: null, currentPhase: null, content: '' };
  }
}

function prompt(question) {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => { rl.close(); resolve(answer); });
  });
}

// Scan
const entries = (existsSync(IN_PROGRESS) ? readdirSync(IN_PROGRESS) : []).filter(e => {
  try { return statSync(join(IN_PROGRESS, e)).isDirectory(); } catch { return false; }
});

const results = { completed: [], active: [], untracked: [] };

for (const entry of entries) {
  const projectDir = join(IN_PROGRESS, entry);
  const trackerFile = findTracker(projectDir);

  if (!trackerFile) {
    results.untracked.push({ slug: entry, projectDir });
    continue;
  }

  const trackerPath = join(projectDir, trackerFile);
  const { unchecked, checked, nextTask, currentPhase, content } = analyzeTracker(trackerPath);
  const documents = ['AUDIT', 'PRD', 'ARCHITECTURE', 'DEVELOPMENT_PLAN', 'PROJECT_TRACKER'];
  const missingDocs = documents.filter(kind => !existsSync(join(projectDir, `${entry}_${kind}.md`)));
  let audit = '';
  try { audit = readFileSync(join(projectDir, `${entry}_AUDIT.md`), 'utf8'); } catch {}
  const logIndex = content.lastIndexOf('\n## Action Log');
  const hasFinalActionLog = logIndex >= 0 && !/^##\s/m.test(content.slice(logIndex + '\n## Action Log'.length));
  const readinessVerified = /^Readiness Status:\s*Verified\s*$/m.test(content)
    && /^Readiness Evidence:\s*\S.+$/m.test(content);
  const archiveEligible = missingDocs.length === 0 && /Audit Status\*\*:\s*Complete/i.test(audit)
    && hasFinalActionLog && readinessVerified;

  const project = {
    slug: entry,
    title: entry.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    trackerFile: trackerPath.replace(ROOT + '/', ''),
    unchecked,
    checked,
    nextTask,
    currentPhase,
    projectDir,
    archiveEligible,
    missingDocs,
  };

  if (unchecked === 0 && checked > 0 && archiveEligible) {
    results.completed.push(project);
  } else {
    results.active.push(project);
  }
}

if (jsonMode) {
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

const line = '─'.repeat(72);
console.log('\n' + line);
console.log('📊 PROJECT TRIAGE REPORT');
console.log(line);

// Completed
if (results.completed.length > 0) {
  console.log(`\n📋 ARCHIVAL CANDIDATES (${results.completed.length}) — local declarations present; review evidence before moving`);
  for (const p of results.completed) {
    console.log(`\n   📁 ${p.title}`);
      console.log(`      ${p.checked} checked tasks | 0 pending/in-progress; declared readiness requires review`);
    console.log(`      From: docs/projects/in-progress/${p.slug}/`);
    console.log(`      To:   docs/projects/completed/${p.slug}/`);
  }
}

// Active
if (results.active.length > 0) {
  console.log(`\n⏳ ACTIVE (${results.active.length}) — pending work or incomplete archival evidence`);
  for (const p of results.active) {
    console.log(`\n   🗂  ${p.title} (${p.unchecked} remaining)`);
    if (p.currentPhase) console.log(`        Phase: ${p.currentPhase}`);
    if (p.nextTask) console.log(`        → ${p.nextTask.substring(0, 80)}${p.nextTask.length > 80 ? '...' : ''}`);
    if (!p.archiveEligible) console.log('        Archival evidence incomplete: require five documents, complete audit, final Action Log and explicit readiness status/evidence.');
  }
}

// Untracked
if (results.untracked.length > 0) {
  console.log(`\n⚠️  UNTRACKED (${results.untracked.length}) — no PROJECT_TRACKER.md found`);
  for (const p of results.untracked) {
    console.log(`   ❓ ${p.slug}`);
  }
}

console.log('\n' + line);
console.log(`Summary: ${results.active.length} active | ${results.completed.length} archival candidates | ${results.untracked.length} untracked`);
console.log(line + '\n');

// Move with confirmation
if (!doMove) {
  if (results.completed.length > 0) {
    console.log(`💡 To archive completed projects: run with --move (requires YES confirmation)\n`);
  }
  process.exit(0);
}

if (results.completed.length === 0) {
  console.log('✅ Nothing to move.\n');
  process.exit(0);
}

// Require explicit YES
console.log(`\n⚠️  ABOUT TO MOVE ${results.completed.length} REVIEWED ARCHIVAL CANDIDATE(S) to docs/projects/completed/`);
console.log('   This cannot be undone without git. Review the list above carefully.\n');
const answer = await prompt('   Type YES to confirm: ');
if (answer.trim() !== 'YES') {
  console.log('\n❌ Cancelled. No folders were moved.\n');
  process.exit(0);
}

// Execute moves
const moved = [];
mkdirSync(COMPLETED, { recursive: true });
for (const p of results.completed) {
  const dest = join(COMPLETED, p.slug);
  if (existsSync(dest)) {
    console.error(`⚠️  Destination already exists, skipping: ${dest}`);
    continue;
  }
  renameSync(p.projectDir, dest);
  moved.push(p.slug);
  console.log(`✅ Moved: ${p.slug} → docs/projects/completed/${p.slug}/`);
}

console.log(`\n✅ Done. Moved ${moved.length} project(s) to completed.\n`);
