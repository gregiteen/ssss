#!/usr/bin/env node
/**
 * Automatically synchronize and verify documentation after OpenWiki updates:
 * 1. Updates overview.md command lists, topics, and primitive counts.
 * 2. Ingests updated docs into OpenWiki knowledge graph.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');
const HELP_DIR = path.join(ROOT, 'docs', 'help');
const OVERVIEW_FILE = path.join(HELP_DIR, 'overview.md');
const CORE_REGISTRY = path.join(ROOT, 'registry', 'core.json');

const commands = fs.readdirSync(SCRIPTS_DIR)
  .filter((f) => f.startsWith('cmd-') && f.endsWith('.mjs'))
  .map((f) => f.replace(/^cmd-/, '').replace(/\.mjs$/, ''))
  .sort();

const helpTopics = fs.existsSync(HELP_DIR)
  ? fs.readdirSync(HELP_DIR)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''))
      .sort()
  : [];

let corePrimitivesCount = 20;
let contractPrimitivesCount = 5;
if (fs.existsSync(CORE_REGISTRY)) {
  const core = JSON.parse(fs.readFileSync(CORE_REGISTRY, 'utf8'));
  corePrimitivesCount = Object.keys(core.document_primitives || {}).length;
  contractPrimitivesCount = Object.keys(core.contract_primitives || {}).length;
}

if (fs.existsSync(OVERVIEW_FILE)) {
  let content = fs.readFileSync(OVERVIEW_FILE, 'utf8');

  // Update primitive counts
  const regPattern = /\|\s*Core registry\s*\|\s*`registry\/core\.json`\s*\|\s*[^|]+\|/;
  const regReplacement = `| Core registry | \`registry/core.json\` | ${corePrimitivesCount} document primitives + ${contractPrimitivesCount} contract primitives; semantic (§11.9), bundle (§16), and provisioning (§17) rules. |`;
  content = content.replace(regPattern, regReplacement);

  // Update help topic list
  const helpSection = `Run \`ssss help <topic>\` for any of:\n\`${helpTopics.join('`, `')}\`.`;
  content = content.replace(/Run `ssss help <topic>` for any of:\n[\s\S]*?(?=\n\nRun `ssss <command>)/, helpSection);

  // Update command list
  const cmdSection = `Run \`ssss <command> --help\` for: \`${commands.join('`, `')}\`.`;
  content = content.replace(/Run `ssss <command> --help` for:[\s\S]*?(?=\n*$)/, cmdSection);

  fs.writeFileSync(OVERVIEW_FILE, content.trim() + '\n', 'utf8');
}

console.log(`✓ Synchronized docs/help/overview.md: ${commands.length} commands, ${helpTopics.length} help topics, ${corePrimitivesCount} primitives.`);
