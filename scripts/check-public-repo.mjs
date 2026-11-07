#!/usr/bin/env node
// Fails when a tracked file holds internal records, a non-shipped skill, a listed private
// name or a personal path. Release SBOMs are exempt: they are hashed records of what an old
// version contained.
//
// The names themselves stay out of this public repository. They are read from a file that
// lives outside it: PUBLIC_REPO_FORBIDDEN_NAMES, or docs/projects/public-repo-forbidden-names.txt
// here or in a Total Recall checkout beside this one. One pattern per line. Without that
// file the other checks still run and the output says the names went unchecked.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);

const LIST = 'docs/projects/public-repo-forbidden-names.txt';
const listFile = [process.env.PUBLIC_REPO_FORBIDDEN_NAMES, path.join(root, LIST), path.join(root, '..', 'total-recall', LIST)]
  .find((candidate) => candidate && fs.existsSync(candidate));
const names = listFile
  ? fs.readFileSync(listFile, 'utf8').split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
  : [];
const named = names.length ? new RegExp(names.join('|'), 'i') : null;
const personalPath = /\/(Users|home)\/[a-z][a-z0-9_-]+\//;

const internal = /^(docs\/projects\/|\.agent\/|\.agents\/|\.cursor\/|\.hermes\/|scratch\/|(HANDOFF|MEMORY|AGENTS|CLAUDE|GEMINI)\.md$|\.cursorrules$)/;

const problems = [];
for (const file of files) {
  if (internal.test(file)) problems.push(`${file}: internal file`);
  if (file.startsWith('skills/') && !file.startsWith('skills/ssss/')) problems.push(`${file}: non-shipped skill`);
  if (file.startsWith('artifacts/sbom-')) continue;
  const full = path.join(root, file);
  if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) continue;
  const text = fs.readFileSync(full, 'utf8');
  if (named?.test(text)) problems.push(`${file}: private name`);
  if (personalPath.test(text)) problems.push(`${file}: personal path`);
}

if (problems.length) {
  console.error(`check-public-repo: ${problems.length} problem(s)\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`check-public-repo: ok (${files.length} tracked files${named ? '' : ', names not checked: no list found'})`);
