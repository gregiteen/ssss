#!/usr/bin/env node
/**
 * next-task.mjs
 *
 * Scans all active project trackers in docs/projects/in-progress/
 * and outputs the next unchecked task from each.
 *
 * Usage:
 *   node .agents/skills/project-management/scripts/next-task.mjs
 *   node .agents/skills/project-management/scripts/next-task.mjs --json
 *   node .agents/skills/project-management/scripts/next-task.mjs --limit 5
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const limitArg = args.find(a => a.startsWith('--limit=') || a === '--limit');
const limit = limitArg
  ? parseInt(limitArg.startsWith('--limit=') ? limitArg.split('=')[1] : args[args.indexOf('--limit') + 1])
  : null;

const ROOT = process.cwd();
const IN_PROGRESS_DIR = join(ROOT, 'docs/projects/in-progress');

function findTrackers(dir) {
  const trackers = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      if (statSync(fullPath).isDirectory()) {
        const files = readdirSync(fullPath);
        for (const file of files) {
          if (file.endsWith('_PROJECT_TRACKER.md') || file === 'PROJECT_TRACKER.md') {
            trackers.push({ project: entry, file: join(fullPath, file) });
          }
        }
      }
    }
  } catch (e) {
    // dir not found
  }
  return trackers;
}

function extractNextTask(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Find current phase (look for ⏳ or In Progress markers)
    let currentPhase = null;
    let nextTask = null;
    let nextTaskLine = null;
    let inActiveSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Track current phase header
      if (line.match(/^#+\s/) ) {
        const isActive = line.includes('⏳') || line.includes('In Progress') || line.includes('Current');
        const isDone = line.includes('✅') || line.includes('Complete') || line.includes('Done');
        inActiveSection = isActive && !isDone;
        if (line.match(/^#{1,3}\s/)) {
          currentPhase = line.replace(/^#+\s/, '').trim();
        }
      }

      // Find first unchecked item
      if (line.match(/^\s*-\s*\[(?:\s*|\/)\]\s+/)) {
        if (!nextTask) {
          nextTask = line.replace(/^\s*-\s*\[(?:\s*|\/)\]\s+/, '').trim();
          nextTaskLine = i + 1;
          // Don't break — we want the phase context
          break;
        }
      }
    }

    return { nextTask, currentPhase, nextTaskLine };
  } catch (e) {
    return { nextTask: null, currentPhase: null, nextTaskLine: null };
  }
}

function slugToTitle(slug) {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Main
const trackers = findTrackers(IN_PROGRESS_DIR);
const results = [];

for (const { project, file } of trackers) {
  const { nextTask, currentPhase } = extractNextTask(file);
  if (nextTask) {
    results.push({
      project: slugToTitle(project),
      slug: project,
      phase: currentPhase,
      nextTask,
      trackerFile: file.replace(ROOT + '/', ''),
    });
  }
}

const limited = limit ? results.slice(0, limit) : results;

if (jsonMode) {
  console.log(JSON.stringify(limited, null, 2));
} else {
  if (limited.length === 0) {
    console.log('✅ No pending tasks found in any active tracker.');
    process.exit(0);
  }

  console.log(`\n📋 NEXT TASKS FROM ACTIVE TRACKERS (${limited.length}/${results.length} projects with pending work)\n`);
  console.log('─'.repeat(72));

  for (const r of limited) {
    console.log(`\n🗂  ${r.project}`);
    if (r.phase) console.log(`   Phase: ${r.phase}`);
    console.log(`   → ${r.nextTask}`);
    console.log(`   📄 ${r.trackerFile}`);
  }

  console.log('\n' + '─'.repeat(72));
  console.log(`\nRun with --json for machine-readable output.`);
  console.log(`Run with --limit N to show only top N projects.\n`);
}
