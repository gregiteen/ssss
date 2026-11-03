#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const projects = path.join(root, 'docs/projects');
const defaultSuffixes = ['PRD', 'ARCHITECTURE', 'DEVELOPMENT_PLAN', 'PROJECT_TRACKER'];
let failures = 0;
const requestedPrefix = process.argv[2];

for (const state of ['planned', 'in-progress', 'completed']) {
  const stateDir = path.join(projects, state);
  if (!fs.existsSync(stateDir)) continue;
  for (const folder of fs.readdirSync(stateDir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && (requestedPrefix ? entry.name === requestedPrefix : state === 'in-progress'))) {
    const prefix = folder.name;
    const hasAudit = fs.existsSync(path.join(stateDir, prefix, `${prefix}_AUDIT.md`));
    const requiredSuffixes = (state === 'planned' || state === 'in-progress' || hasAudit)
      ? ['AUDIT', ...defaultSuffixes]
      : defaultSuffixes;

    for (const suffix of requiredSuffixes) {
      const file = path.join(stateDir, prefix, `${prefix}_${suffix}.md`);
      if (!fs.existsSync(file)) {
        console.error(`Missing ${file}`);
        failures++;
        continue;
      }
      const content = fs.readFileSync(file, 'utf8');
      if (!/^---\s*\ntype:\s*project_document/m.test(content)) {
        console.error(`${file}: Missing or invalid frontmatter (must declare type: project_document)`);
        failures++;
      }
      const stateMatch = content.match(/Kanban State\*\*:\s*([^\n]+)/);
      if (stateMatch) {
        const declared = stateMatch[1].trim();
        if (state === 'in-progress' && !declared.includes('In Progress')) {
          console.error(`${file}: Kanban State is '${declared}' but folder is in-progress/`);
          failures++;
        } else if (state === 'completed' && !declared.includes('Completed')) {
          console.error(`${file}: Kanban State is '${declared}' but folder is completed/`);
          failures++;
        } else if (state === 'planned' && !declared.includes('Planned')) {
          console.error(`${file}: Kanban State is '${declared}' but folder is planned/`);
          failures++;
        }
      }
    }

    const tracker = path.join(stateDir, prefix, `${prefix}_PROJECT_TRACKER.md`);
    if (fs.existsSync(tracker)) {
      const trackerContent = fs.readFileSync(tracker, 'utf8');
      if (state === 'in-progress' && !trackerContent.includes('## Action Log')) {
        console.error(`Active project tracker missing mandatory ## Action Log: ${tracker}`);
        failures++;
      }
      if (state === 'completed' && (requestedPrefix ? requestedPrefix === prefix : false) && /- \[ \]|- \[\/\]/.test(trackerContent)) {
        console.error(`Completed project has open tasks: ${tracker}`);
        failures++;
      }
    }
  }
}
if (failures) process.exitCode = 1;
else console.error('Project document structure is complete.');
