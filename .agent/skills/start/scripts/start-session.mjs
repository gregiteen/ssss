#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
const args = process.argv.slice(2);
if (args.includes('--help')) { console.log('Usage: start-session.mjs [--check-only] [--app-check command] [--app-start command]\nUses installed Total Recall only; missing startup support fails visibly. No auto-install.'); process.exit(0); }
const forwarded = args.filter(a => a !== '--check-only');
const local = path.join(process.cwd(), 'total-recall');
const binary = fs.existsSync(local) ? local : 'total-recall';
async function invoke(argv) {
  return new Promise(resolve => {
    const child = spawn(binary, argv, { cwd: process.cwd(), shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'inherit'] });
    let timer, output = '';
    child.stdout.on('data', chunk => { process.stdout.write(chunk); if (output.length < 262144) output += chunk.toString(); });
    child.on('error', () => { clearTimeout(timer); console.error('Installed Total Recall launcher unavailable.'); resolve({code:1, output}); });
    timer = setTimeout(() => { try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL'); } catch {} }, 60000);
    child.on('close', code => { clearTimeout(timer); resolve({code:code ?? 1, output}); });
  });
}
let status = await invoke(['startup-check', args.includes('--check-only') ? 'check' : 'ensure', '--json', ...forwarded]);
const briefStatus = await invoke(['brief']);
let report;
try { report = JSON.parse(status.output); } catch {}
if (status.code && (report?.server?.reason === 'health-unreachable' || report?.brain?.reason === 'instructions-unreachable')) {
  console.error('Rechecking transient shared-runtime transport failure after brief.');
  status = await invoke(['startup-check', 'check', '--json', ...forwarded]);
}
process.exitCode = status.code || briefStatus.code;
