/** Machine-readable reference adapter conformance report. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MemoryVfs, FileSystemVfs, runVfsContract } from '../src/vfs.mjs';
import { MemoryLeaseStore, FileLeaseStore, runLeaseContract } from '../src/leases.mjs';
import { MemoryIdempotencyStore, FileIdempotencyStore, runIdempotencyContract } from '../src/idempotency.mjs';
import { parseArgs, die, wantsHelp } from './lib/cli.mjs';

export async function run(argv) {
  if (wantsHelp(argv)) { console.log('Usage: ssss adapter conformance [--out <file>]'); return; }
  if (argv[0] !== 'conformance') die('Expected adapter conformance.');
  const { flags } = parseArgs(argv.slice(1));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-adapters-'));
  try {
    const suites = {
      vfs_memory: await runVfsContract(new MemoryVfs()),
      vfs_filesystem: await runVfsContract(new FileSystemVfs(path.join(root, 'vfs'))),
      lease_memory: await runLeaseContract(new MemoryLeaseStore()),
      lease_filesystem: await runLeaseContract(new FileLeaseStore(path.join(root, 'leases'))),
      idempotency_memory: await runIdempotencyContract(new MemoryIdempotencyStore()),
      idempotency_filesystem: await runIdempotencyContract(new FileIdempotencyStore(path.join(root, 'idempotency'))),
    };
    const report = { version: 1, passed: Object.values(suites).every((suite) => suite.passed), suites };
    const text = `${JSON.stringify(report, null, 2)}\n`;
    if (flags.out) fs.writeFileSync(path.resolve(flags.out), text, { flag: 'wx', mode: 0o600 }); else process.stdout.write(text);
    if (!report.passed) process.exitCode = 1;
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
