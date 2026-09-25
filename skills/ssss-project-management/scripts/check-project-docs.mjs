#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const projects = path.join(root, 'docs/projects');
const suffixes = ['PRD', 'ARCHITECTURE', 'DEVELOPMENT_PLAN', 'PROJECT_TRACKER'];
let failures = 0;
const requestedPrefix = process.argv[2];
for (const state of ['planned', 'in-progress', 'completed']) {
  const stateDir = path.join(projects, state);
  if (!fs.existsSync(stateDir)) continue;
  for (const folder of fs.readdirSync(stateDir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && (requestedPrefix ? entry.name === requestedPrefix : state === 'in-progress'))) {
    const prefix = folder.name;
    for (const suffix of suffixes) {
      const file = path.join(stateDir, prefix, `${prefix}_${suffix}.md`);
      if (!fs.existsSync(file)) { console.error(`Missing ${file}`); failures++; }
    }
    const tracker = path.join(stateDir, prefix, `${prefix}_PROJECT_TRACKER.md`);
    if (fs.existsSync(tracker) && state === 'completed' && /- \[ \]|- \[\/\]/.test(fs.readFileSync(tracker, 'utf8'))) {
      console.error(`Completed project has open tasks: ${tracker}`);
      failures++;
    }
  }
}
if (failures) process.exitCode = 1;
else console.error('Project document structure is complete.');
