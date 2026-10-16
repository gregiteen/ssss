#!/usr/bin/env node
// Inspect actual local template presence; this does not validate remote issues.
import fs from 'node:fs';
import path from 'node:path';
const required = process.argv.slice(2);
let failures = 0;
if (required.length) {
  for (const name of required) {
    const target = path.resolve(name);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      console.error(`Missing explicitly required local template: ${name}`);
      failures++;
    } else console.log(`Present local template: ${name}`);
  }
} else {
  const root = path.resolve('.github');
  const templates = [];
  for (const name of ['pull_request_template.md', 'PULL_REQUEST_TEMPLATE.md']) {
    if (fs.existsSync(path.join(root, name))) templates.push(name);
  }
  for (const folder of ['ISSUE_TEMPLATE', 'PULL_REQUEST_TEMPLATE']) {
    if (fs.existsSync(path.join(root, folder)) && fs.statSync(path.join(root, folder)).isDirectory()) {
      for (const name of fs.readdirSync(path.join(root, folder))) {
        if (/\.(?:md|ya?ml)$/i.test(name) && fs.statSync(path.join(root, folder, name)).isFile()) templates.push(`${folder}/${name}`);
      }
    }
  }
  console.log(templates.length ? `Discovered local template files: ${templates.join(', ')}` : 'No local GitHub templates discovered; no template requirement inferred.');
}
console.log('Scope: local file presence only. Template contents and remote issue/PR state require separate review.');
process.exitCode = failures ? 1 : 0;
