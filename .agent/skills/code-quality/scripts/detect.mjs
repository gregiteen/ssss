#!/usr/bin/env node
// Repo entry point kept for existing docs. Prints facts and a proposed config;
// record changes with `total-recall skill config code-quality …`.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const core = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'core', 'detect.mjs');
process.exit(spawnSync(process.execPath, [core, ...process.argv.slice(2)], { stdio: 'inherit' }).status ?? 1);
