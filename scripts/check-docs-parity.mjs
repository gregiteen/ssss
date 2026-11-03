#!/usr/bin/env node
/**
 * Fail-closed documentation parity gate.
 * Verifies all CLI commands and topics are documented.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');
const OVERVIEW_FILE = path.join(ROOT, 'docs', 'help', 'overview.md');

const commands = fs.readdirSync(SCRIPTS_DIR)
  .filter((f) => f.startsWith('cmd-') && f.endsWith('.mjs'))
  .map((f) => f.replace(/^cmd-/, '').replace(/\.mjs$/, ''))
  .sort();

if (!fs.existsSync(OVERVIEW_FILE)) {
  console.error('docs/help/overview.md missing!');
  process.exit(1);
}

const overview = fs.readFileSync(OVERVIEW_FILE, 'utf8');
const missing = [];

for (const cmd of commands) {
  if (!overview.includes(`\`${cmd}\``)) {
    missing.push(cmd);
  }
}

if (missing.length > 0) {
  console.error(`Documentation parity failure: commands missing from docs/help/overview.md: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`ok: documentation parity verified for all ${commands.length} commands.`);
